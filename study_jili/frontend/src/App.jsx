import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Battery, BookOpen, ShoppingCart,
    Flame, Shield, Zap, AlertTriangle
} from 'lucide-react';

// 修改处：直接使用相对路径，Vercel 会处理转发，本地 Vite 会处理代理
const API_URL = "/api";

function App() {
    const [status, setStatus] = useState(null);
    const [rewards, setRewards] = useState([]);
    const [minutes, setMinutes] = useState(60);
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        try {
            await axios.post(`${API_URL}/daily_check`);
            const statusRes = await axios.get(`${API_URL}/status`);
            const rewardsRes = await axios.get(`${API_URL}/rewards`);
            setStatus(statusRes.data);
            setRewards(rewardsRes.data);
        } catch (error) {
            console.error("Error fetching data:", error);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleLogStudy = async () => {
        setLoading(true);
        try {
            const res = await axios.post(`${API_URL}/log_study`, { duration_minutes: parseInt(minutes), note });
            alert(`棒！获得 ${res.data.total_earned} 能量 (含 ${res.data.bonus_multiplier} 倍率加成)`);
            setNote("");
            fetchData();
        } catch (e) {
            alert("提交失败，请检查网络");
        } finally {
            setLoading(false);
        }
    };

    const handleRedeem = async (item) => {
        if (status.energy < item.cost) {
            alert("能量不足！"); return;
        }
        if (!confirm(`确定消耗 ${item.cost} 能量兑换 "${item.name}" 吗？`)) return;

        try {
            await axios.post(`${API_URL}/redeem/${item.id}`);
            alert("兑换成功！");
            fetchData();
        } catch (e) {
            alert("兑换失败");
        }
    };

    if (!status) return <div className="p-10 text-white">正在加载系统...</div>;

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8 font-sans selection:bg-purple-500 selection:text-white">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex justify-between items-center bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                            LevelUp Learning
                        </h1>
                    </div>
                    <div className="text-right">
                        <div className="flex items-center space-x-2 text-yellow-400 text-2xl md:text-4xl font-mono font-bold">
                            <Battery className="md:w-8 md:h-8 w-6 h-6" />
                            <span>{status.energy}</span>
                        </div>
                    </div>
                </header>

                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 relative overflow-hidden">
                        <div className="absolute right-0 top-0 opacity-10 transform translate-x-2 -translate-y-2"><Flame size={80} /></div>
                        <h2 className="text-slate-400 text-xs font-bold uppercase">连胜 Streak</h2>
                        <div className="text-3xl font-bold text-orange-500 mt-2">{status.streak} 天</div>
                        <div className="mt-2 text-xs text-slate-400">
                            {status.freezes > 0 ? (
                                <span className="flex items-center text-blue-300"><Shield size={12} className="mr-1"/> 保护中 ({status.freezes})</span>
                            ) : (
                                <span className="flex items-center text-red-400"><AlertTriangle size={12} className="mr-1"/> 无保护</span>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                        <h2 className="text-slate-400 text-xs font-bold uppercase">倍率 Bonus</h2>
                        <div className="text-3xl font-bold text-purple-400 mt-2">x{status.multiplier}</div>
                        <div className="mt-2 text-xs text-slate-400">当前能量获取效率</div>
                    </div>

                    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                        <h2 className="text-slate-400 text-xs font-bold uppercase">今日进度</h2>
                        <div className="text-3xl font-bold text-blue-400 mt-2">{status.today_hours} <span className="text-lg text-slate-500">/ {status.goal} h</span></div>
                        <div className="w-full bg-slate-700 h-2 mt-3 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full transition-all duration-500" style={{width: `${Math.min((status.today_hours/status.goal)*100, 100)}%`}}></div>
                        </div>
                    </div>
                </div>

                {/* Input & Shop */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-slate-800 rounded-2xl border border-slate-700 p-6">
                        <h3 className="text-lg font-bold mb-4 flex items-center"><BookOpen className="mr-2 text-blue-400"/> 记录学习</h3>
                        <div className="flex gap-2 mb-4">
                            {[30, 60, 90, 120].map(m => (
                                <button key={m} onClick={() => setMinutes(m)} className={`px-3 py-1 rounded text-sm ${minutes === m ? 'bg-blue-600' : 'bg-slate-700'}`}>{m}m</button>
                            ))}
                        </div>
                        <input type="number" value={minutes} onChange={e=>setMinutes(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-3 mb-3" placeholder="分钟" />
                        <input type="text" value={note} onChange={e=>setNote(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-3 mb-4" placeholder="备注..." />
                        <button onClick={handleLogStudy} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded font-bold transition">提交记录</button>

                        <div className="mt-6 space-y-2">
                            <h4 className="text-xs font-bold text-slate-500 uppercase">今日记录</h4>
                            {status.logs.map(log => (
                                <div key={log.id} className="flex justify-between bg-slate-700/30 p-2 rounded text-sm">
                                    <span>{log.note || "学习"}</span>
                                    <span className="text-yellow-500">+{log.earned_energy.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                        <h3 className="text-lg font-bold mb-4 flex items-center"><ShoppingCart className="mr-2 text-purple-400"/> 商店</h3>
                        <div className="space-y-3 overflow-y-auto max-h-[400px]">
                            {rewards.map(item => (
                                <div key={item.id} className="bg-slate-700/40 p-3 rounded border border-slate-600">
                                    <div className="flex justify-between font-bold text-sm">
                                        <span className={item.name.includes("冻结") ? "text-blue-300" : "text-white"}>{item.name}</span>
                                        <span className="text-yellow-400">{item.cost}</span>
                                    </div>
                                    <button onClick={()=>handleRedeem(item)} className="w-full mt-2 bg-slate-600 hover:bg-purple-600 text-xs py-1 rounded transition">兑换</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default App;