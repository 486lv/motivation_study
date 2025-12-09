import os
from fastapi import FastAPI, HTTPException
from sqlmodel import SQLModel, Field, Session, create_engine, select
from typing import Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel
from contextlib import asynccontextmanager

# --- 1. 数据库配置 (智能切换) ---
# Vercel 会提供 POSTGRES_URL。如果没有（本地开发），则使用 sqlite。
database_url = os.environ.get("POSTGRES_URL")

if database_url and database_url.startswith("postgres://"):
    # SQLAlchemy 需要 postgresql:// 开头
    database_url = database_url.replace("postgres://", "postgresql://", 1)

# 如果本地开发，使用 SQLite
engine_url = database_url if database_url else "sqlite:///./local_dev.db"
engine = create_engine(engine_url)

# --- 2. 数据库模型 (保持不变) ---
class UserConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    energy_balance: float = Field(default=0.0)
    daily_goal_hours: float = Field(default=4.0)
    base_reward_rate: float = Field(default=10.0)
    penalty_amount: float = Field(default=50.0)
    last_check_date: str = Field(default=str(date.today()))
    current_streak: int = Field(default=0)
    streak_freezes: int = Field(default=0)
    max_streak_bonus: float = Field(default=1.5)

class StudyLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: str = Field(default=str(date.today()))
    duration_minutes: int
    note: Optional[str] = None
    earned_energy: float = Field(default=0.0)

class RewardItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    cost: float
    description: Optional[str] = None
    is_system_item: bool = Field(default=False)

# --- 3. 初始化逻辑 ---
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # 初始化用户
        if not session.exec(select(UserConfig)).first():
            session.add(UserConfig())

        # 初始化系统道具
        if not session.exec(select(RewardItem).where(RewardItem.name == "连胜冻结卡")).first():
            session.add(RewardItem(
                name="连胜冻结卡",
                cost=30.0,
                description="自动消耗以保护连胜记录不被清零",
                is_system_item=True
            ))
        session.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

# --- Pydantic 模型 ---
class LogCreate(BaseModel):
    duration_minutes: int
    note: str

class RewardCreate(BaseModel):
    name: str
    cost: float
    description: str = ""

# --- 辅助函数 ---
def calculate_multiplier(streak: int) -> float:
    return min(1.0 + (streak * 0.05), 1.5)

# --- API 路由 (注意：路径前缀 /api 在 vercel.json 处理，这里保持原样) ---

@app.get("/api/status")
def get_status():
    with Session(engine) as session:
        config = session.exec(select(UserConfig)).first()
        today = str(date.today())
        logs = session.exec(select(StudyLog).where(StudyLog.date == today)).all()
        total_today_minutes = sum(log.duration_minutes for log in logs)
        multiplier = calculate_multiplier(config.current_streak)

        return {
            "energy": round(config.energy_balance, 1),
            "today_hours": round(total_today_minutes / 60, 2),
            "goal": config.daily_goal_hours,
            "streak": config.current_streak,
            "multiplier": round(multiplier, 2),
            "freezes": config.streak_freezes,
            "logs": logs
        }

@app.post("/api/log_study")
def log_study(log_data: LogCreate):
    with Session(engine) as session:
        config = session.exec(select(UserConfig)).first()
        multiplier = calculate_multiplier(config.current_streak)
        base_earned = (log_data.duration_minutes / 60.0) * config.base_reward_rate
        final_earned = base_earned * multiplier

        new_log = StudyLog(
            duration_minutes=log_data.duration_minutes,
            note=log_data.note,
            earned_energy=final_earned
        )
        config.energy_balance += final_earned
        session.add(new_log)
        session.add(config)
        session.commit()
        return {"message": "Logged!", "total_earned": round(final_earned, 1), "bonus_multiplier": f"x{multiplier}"}

@app.post("/api/daily_check")
def daily_check():
    with Session(engine) as session:
        config = session.exec(select(UserConfig)).first()
        today = date.today()
        last_check = datetime.strptime(config.last_check_date, "%Y-%m-%d").date()

        if last_check >= today:
            return {"message": "Checked"}

        yesterday = today - timedelta(days=1)
        yesterday_str = str(yesterday)
        logs = session.exec(select(StudyLog).where(StudyLog.date == yesterday_str)).all()
        yesterday_hours = sum(log.duration_minutes for log in logs) / 60.0

        if yesterday_hours >= config.daily_goal_hours:
            config.current_streak += 1
        else:
            if config.streak_freezes > 0:
                config.streak_freezes -= 1
            else:
                config.current_streak = 0
                config.energy_balance -= config.penalty_amount

        if (today - last_check).days > 1:
            config.current_streak = 0

        config.last_check_date = str(today)
        session.add(config)
        session.commit()
        return {"message": "Daily check done"}

@app.get("/api/rewards")
def get_rewards():
    with Session(engine) as session:
        return session.exec(select(RewardItem)).all()

@app.post("/api/rewards")
def add_reward(item: RewardCreate):
    with Session(engine) as session:
        session.add(RewardItem.from_orm(item))
        session.commit()
    return {"message": "Added"}

@app.post("/api/redeem/{reward_id}")
def redeem_reward(reward_id: int):
    with Session(engine) as session:
        config = session.exec(select(UserConfig)).first()
        item = session.get(RewardItem, reward_id)
        if not item or config.energy_balance < item.cost:
            raise HTTPException(400, "Error")

        config.energy_balance -= item.cost
        if item.name == "连胜冻结卡":
            config.streak_freezes += 1
        session.add(config)
        session.commit()
        return {"message": "Redeemed"}