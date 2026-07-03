import { useState, useEffect, useCallback, useRef } from "react";
import {
  Home,
  Users,
  ClipboardList,
  Wallet,
  Send,
  Clock,
  Copy,
  CheckCircle2,
  Gift,
  Settings,
  Trash2,
  Plus,
} from "lucide-react";

/* ============================================================
   SOZLAMALAR
============================================================ */
const BOT_TOKEN = "8790946212:AAGDGFUHWaj_iFiwZ8xRIlTV-3t9qnLlbDE"; // <-- BotFather'dan yangi token qo'y
const BOT_USERNAME = "TapucroBot"; // @siz
const ADMIN_CHAT_ID = "7060092076"; // admin telegram ID
const CHANNEL_USERNAME = "@tapuckanal"; // default task uchun kanal

const DAILY_LIMIT = 200;
const REFERRAL_BONUS = 50;
const SIGNUP_BONUS = 20;
const TASK_BONUS = 50;

const STORAGE_KEY = "tapuc:state";
const TASKS_STORAGE_KEY = "tapuc:tasks";
const REF_STORAGE_KEY = "tapuc:refs";
const ANON_ID_KEY = "tapuc:anon-id";

const TIERS = [
  { ball: 1000, uc: 60 },
  { ball: 3000, uc: 360 },
];

const DEFAULT_TASKS = [
  {
    id: "sub_channel",
    title: "Kanalga obuna bo'ling",
    desc: `${CHANNEL_USERNAME} kanaliga a'zo bo'ling`,
    bonus: TASK_BONUS,
    link: `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`,
    channel: CHANNEL_USERNAME,
  },
];

// ranglar
const C = {
  bg: "#EEF1F6",
  card: "#FFFFFF",
  navy: "#141A2E",
  orange: "#F7A928",
  orangeDark: "#F58A1F",
  amber: "#FDF3E2",
};

const gradient = `linear-gradient(90deg, ${C.orange}, ${C.orangeDark})`;
const gradientDiag = `linear-gradient(135deg, ${C.orange}, ${C.orangeDark})`;
const orangeShadow = "0 6px 16px rgba(247,169,40,0.4)";
const orangeGlow = "0 0 50px rgba(247,169,40,0.45)";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function estimateUC(ball) {
  if (!ball || ball <= 0) return 0;

  const [a, b] = TIERS;
  const rateA = a.uc / a.ball;
  const rateB = b.uc / b.ball;

  let rate;
  if (ball <= a.ball) rate = rateA;
  else if (ball >= b.ball) rate = rateB;
  else {
    const t = (ball - a.ball) / (b.ball - a.ball);
    rate = rateA + t * (rateB - rateA);
  }

  return Math.round(ball * rate);
}

function getTelegram() {
  try {
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadLS(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return safeParse(raw, fallback);
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const defaultState = {
  balance: 0,
  dailyTaps: 0,
  lastTapDate: todayStr(),
  withdrawals: [],
  refApplied: false,
  claimedReferrals: 0,
  completedTasks: [],
};

function Notice({ notice }) {
  if (!notice) return null;
  const isError = notice.type === "error";

  return (
    <div
      className="text-sm font-semibold rounded-xl px-3 py-2 text-center"
      style={{
        backgroundColor: isError ? "#FEF2F2" : "#ECFDF5",
        color: isError ? "#EF4444" : "#059669",
      }}
    >
      {notice.text}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center py-2"
      style={{
        color: active ? C.orange : "#94A3B8",
        fontWeight: active ? 800 : 700,
      }}
    >
      {icon}
      <span className="text-[11px] mt-1">{label}</span>
    </button>
  );
}

export default function TapUCApp() {
  const [state, setState] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState("home");
  const [pop, setPop] = useState(false);

  const [ucId, setUcId] = useState("");
  const [amount, setAmount] = useState("");

  const [notice, setNotice] = useState(null);

  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("Foydalanuvchi");

  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [newTask, setNewTask] = useState({
    title: "",
    channelUsername: "",
    bonus: "",
  });

  const saveTimer = useRef(null);

  const isAdmin = Boolean(myId && ADMIN_CHAT_ID && String(myId) === String(ADMIN_CHAT_ID));

  const showNotice = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => {
      setNotice((current) => (current?.text === text ? null : current));
    }, 2500);
  };

  /* ---------- Telegram / guest user ---------- */
  useEffect(() => {
    const tg = getTelegram();
    tg?.ready?.();

    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser?.id) {
      setMyId(String(tgUser.id));
      setMyName(
        tgUser.username ? `@${tgUser.username}` : tgUser.first_name || "Foydalanuvchi"
      );
      return;
    }

    let anonId = localStorage.getItem(ANON_ID_KEY);
    if (!anonId) {
      anonId = "guest_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(ANON_ID_KEY, anonId);
    }
    setMyId(anonId);
    setMyName("Mehmon");
  }, []);

  /* ---------- load user state ---------- */
  useEffect(() => {
    const parsed = loadLS(STORAGE_KEY, null);

    if (parsed) {
      const today = todayStr();
      if (parsed.lastTapDate !== today) {
        parsed.dailyTaps = 0;
        parsed.lastTapDate = today;
      }
      setState({ ...defaultState, ...parsed });
    }

    const savedTasks = loadLS(TASKS_STORAGE_KEY, null);
    if (savedTasks && Array.isArray(savedTasks)) {
      setTasks(savedTasks);
    } else {
      saveLS(TASKS_STORAGE_KEY, DEFAULT_TASKS);
      setTasks(DEFAULT_TASKS);
    }

    setLoaded(true);
  }, []);

  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveLS(STORAGE_KEY, next);
    }, 250);
  }, []);

  useEffect(() => {
    if (loaded) persist(state);
  }, [state, loaded, persist]);

  const saveTasks = (next) => {
    setTasks(next);
    saveLS(TASKS_STORAGE_KEY, next);
  };

  /* ---------- referral apply on first join ---------- */
  useEffect(() => {
    if (!loaded || !myId || state.refApplied) return;

    const tg = getTelegram();
    const startParam = tg?.initDataUnsafe?.start_param;

    if (startParam && startParam.startsWith("ref_")) {
      const refCode = startParam.slice(4);

      if (refCode && refCode !== myId) {
        const refs = loadLS(REF_STORAGE_KEY, {});
        const list = Array.isArray(refs[refCode]) ? refs[refCode] : [];

        if (!list.includes(myId)) {
          refs[refCode] = [...list, myId];
          saveLS(REF_STORAGE_KEY, refs);

          setState((s) => ({
            ...s,
            balance: s.balance + SIGNUP_BONUS,
            refApplied: true,
          }));

          showNotice("success", `Xush kelibsiz! +${SIGNUP_BONUS} ball qo'shildi`);
        }
      }
    }
  }, [loaded, myId, state.refApplied]);

  /* ---------- claim referral earnings ---------- */
  const checkReferralEarnings = useCallback(() => {
    if (!myId) return;

    const refs = loadLS(REF_STORAGE_KEY, {});
    const list = Array.isArray(refs[myId]) ? refs[myId] : [];

    setReferralCount(list.length);

    setState((s) => {
      if (list.length > s.claimedReferrals) {
        const newOnes = list.length - s.claimedReferrals;
        return {
          ...s,
          balance: s.balance + newOnes * REFERRAL_BONUS,
          claimedReferrals: list.length,
        };
      }
      return s;
    });
  }, [myId]);

  useEffect(() => {
    if (loaded && myId) checkReferralEarnings();
  }, [loaded, myId, tab, checkReferralEarnings]);

  /* ---------- tap ---------- */
  const handleTap = () => {
    if (state.dailyTaps >= DAILY_LIMIT) {
      showNotice("error", "Bugungi tap limiti tugagan");
      return;
    }

    setPop(true);
    setTimeout(() => setPop(false), 120);

    setState((s) => ({
      ...s,
      balance: s.balance + 1,
      dailyTaps: s.dailyTaps + 1,
      lastTapDate: todayStr(),
    }));
  };

  /* ---------- telegram notify admin ---------- */
  const notifyAdmin = async (request) => {
    if (!BOT_TOKEN || BOT_TOKEN === "TOKEN_HERE" || !ADMIN_CHAT_ID) return;

    try {
      const text =
        `Yangi yechish so'rovi\n\n` +
        `Foydalanuvchi: ${myName || myId}\n` +
        `ID: ${myId}\n` +
        `PUBG ID: ${request.ucId}\n` +
        `Ball: ${request.ball}\n` +
        `UC: ${request.uc}\n` +
        `Sana: ${request.date}`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text }),
      });
    } catch (e) {
      console.error("Adminga xabar yuborilmadi:", e);
    }
  };

  /* ---------- withdraw ---------- */
  const submitWithdraw = () => {
    const val = parseInt(amount, 10);

    if (!ucId.trim()) {
      showNotice("error", "PUBG ID raqamini kiriting");
      return;
    }

    if (!val || val <= 0) {
      showNotice("error", "Ball miqdorini to'g'ri kiriting");
      return;
    }

    if (val > state.balance) {
      showNotice("error", "Balansingizda yetarli ball yo'q");
      return;
    }

    const uc = estimateUC(val);

    const request = {
      id: Date.now(),
      ucId: ucId.trim(),
      ball: val,
      uc,
      date: new Date().toLocaleString("uz-UZ"),
      status: "Kutilmoqda",
    };

    setState((s) => ({
      ...s,
      balance: s.balance - val,
      withdrawals: [request, ...s.withdrawals],
    }));

    notifyAdmin(request);

    setAmount("");
    setUcId("");
    showNotice("success", `So'rov yuborildi: ${val} ball → ${uc} UC`);
  };

  /* ---------- task complete ---------- */
  const completeTask = async (task) => {
    if (state.completedTasks.includes(task.id)) return;

    // agar Telegram ichida bo'lsa va token bor bo'lsa obunani tekshiradi
    if (BOT_TOKEN && BOT_TOKEN !== "TOKEN_HERE" && myId && !String(myId).startsWith("guest_")) {
      try {
        const channel = task.channel || CHANNEL_USERNAME;

        const res = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(
            channel
          )}&user_id=${myId}`
        );

        const data = await res.json();
        const status = data?.result?.status;

        if (!["member", "administrator", "creator"].includes(status)) {
          showNotice("error", "Avval kanalga obuna bo'ling, keyin qayta tekshiring");
          return;
        }
      } catch {
        showNotice("error", "Tekshirishda xatolik, keyinroq urinib ko'ring");
        return;
      }
    }

    setState((s) => ({
      ...s,
      balance: s.balance + task.bonus,
      completedTasks: [...s.completedTasks, task.id],
    }));

    showNotice("success", `+${task.bonus} ball qo'shildi!`);
  };

  /* ---------- referral copy ---------- */
  const copyReferralLink = async () => {
    if (!myId) return;

    const link = `https://t.me/${BOT_USERNAME}?start=ref_${myId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showNotice("error", "Nusxalab bo'lmadi, qo'lda ko'chiring");
    }
  };

  /* ---------- admin task add/remove ---------- */
  const addChannelTask = () => {
    const username = newTask.channelUsername.trim().replace(/^@/, "");
    const bonus = parseInt(newTask.bonus, 10);

    if (!username) {
      showNotice("error", "Kanal username kiriting");
      return;
    }

    if (!bonus || bonus <= 0) {
      showNotice("error", "Ball miqdorini to'g'ri kiriting");
      return;
    }

    const task = {
      id: "sub_" + username + "_" + Date.now(),
      title: newTask.title.trim() || "Kanalga obuna bo'ling",
      desc: `@${username} kanaliga a'zo bo'ling`,
      bonus,
      link: `https://t.me/${username}`,
      channel: `@${username}`,
    };

    saveTasks([...tasks, task]);
    setNewTask({ title: "", channelUsername: "", bonus: "" });
    showNotice("success", "Yangi vazifa qo'shildi");
  };

  const removeTask = (id) => {
    saveTasks(tasks.filter((t) => t.id !== id));
    showNotice("success", "Vazifa o'chirildi");
  };

  /* ---------- derived ---------- */
  const tapProgress = Math.min(100, (state.dailyTaps / DAILY_LIMIT) * 100);
  const liveUC = amount ? estimateUC(parseInt(amount, 10) || 0) : 0;
  const referralLink = myId ? `https://t.me/${BOT_USERNAME}?start=ref_${myId}` : "";

  const inputStyle = {
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    padding: "10px 12px",
    color: C.navy,
    fontWeight: 600,
    width: "100%",
    outline: "none",
    marginTop: 8,
    backgroundColor: "#fff",
  };

  const cardStyle = {
    backgroundColor: C.card,
    borderRadius: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    border: "1px solid #F1F5F9",
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center py-6 px-3"
      style={{ backgroundColor: C.bg }}
    >
      <div
        className="w-full max-w-sm overflow-hidden pb-4"
        style={{
          backgroundColor: C.bg,
          borderRadius: 28,
          boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
        }}
      >
        {/* header */}
        <div
          className="px-4 py-3 flex items-center gap-3 border-b"
          style={{ backgroundColor: C.card, borderColor: "#F1F5F9" }}
        >
          <div
            className="w-11 h-11 flex flex-col items-center justify-center leading-tight shrink-0"
            style={{
              background: gradientDiag,
              borderRadius: 16,
              color: C.navy,
              fontWeight: 900,
              fontSize: 10,
              boxShadow: orangeShadow,
            }}
          >
            <span>UC</span>
            <span>BOT</span>
          </div>

          <div className="flex-1 min-w-0">
            <div
              className="text-base leading-none truncate"
              style={{ color: C.navy, fontWeight: 800 }}
            >
              PUBG UC BOT
            </div>
            <div className="text-xs mt-1" style={{ color: "#94A3B8" }}>
              {myName || "Foydalanuvchi"}
            </div>
          </div>

          <div
            className="text-sm px-4 py-1.5 whitespace-nowrap"
            style={{
              background: gradient,
              color: "#fff",
              fontWeight: 800,
              borderRadius: 999,
              boxShadow: orangeShadow,
            }}
          >
            {state.balance} ball
          </div>
        </div>

        {notice && (
          <div className="p-2 px-4">
            <Notice notice={notice} />
          </div>
        )}

        {/* content */}
        <div className="px-4 pt-2 pb-24" style={{ minHeight: 500 }}>
          {/* HOME */}
          {tab === "home" && (
            <>
              <div className="py-5 text-center mb-6" style={cardStyle}>
                <div className="text-sm font-medium" style={{ color: "#94A3B8" }}>
                  Umumiy balans
                </div>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span
                    className="text-4xl"
                    style={{ color: C.navy, fontWeight: 900 }}
                  >
                    {state.balance}
                  </span>
                  <span
                    className="text-xl"
                    style={{ color: C.orange, fontWeight: 800 }}
                  >
                    ball
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <button
                  onClick={handleTap}
                  disabled={state.dailyTaps >= DAILY_LIMIT}
                  className="w-56 h-56 rounded-full flex items-center justify-center transition-transform duration-100"
                  style={{
                    background: C.navy,
                    border: `10px solid ${C.orange}`,
                    boxShadow: orangeGlow,
                    transform: pop ? "scale(0.95)" : "scale(1)",
                    opacity: state.dailyTaps >= DAILY_LIMIT ? 0.6 : 1,
                  }}
                >
                  <div className="text-center leading-none select-none">
                    <div
                      className="text-3xl tracking-wide"
                      style={{ color: C.orange, fontWeight: 900 }}
                    >
                      TAP
                    </div>
                    <div
                      className="text-3xl tracking-wide"
                      style={{ color: "#fff", fontWeight: 900 }}
                    >
                      UC
                    </div>
                  </div>
                </button>

                <div className="mt-4 text-sm font-medium" style={{ color: "#94A3B8" }}>
                  {state.dailyTaps} / {DAILY_LIMIT} tap
                </div>
              </div>

              <div className="p-4 mt-6" style={cardStyle}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: C.navy, fontWeight: 700 }}>
                    Kunlik taraqqiyot
                  </span>
                  <span className="text-sm" style={{ color: C.orange, fontWeight: 800 }}>
                    {state.dailyTaps} / {DAILY_LIMIT}
                  </span>
                </div>

                <div
                  className="w-full h-2.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: "#F1F5F9" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${tapProgress}%`, background: gradient }}
                  />
                </div>
              </div>

              <div className="p-4 mt-4" style={cardStyle}>
                <div className="flex items-center gap-2 mb-2">
                  <Gift size={18} color={C.orange} />
                  <div style={{ color: C.navy, fontWeight: 800 }}>Bonuslar</div>
                </div>
                <div className="text-sm text-gray-500">
                  Referal orqali kirgan har bir do'st uchun{" "}
                  <span className="font-bold text-black">+{REFERRAL_BONUS}</span> ball.
                </div>
              </div>
            </>
          )}

          {/* REFERAL */}
          {tab === "referal" && (
            <div className="space-y-4">
              <div className="p-4 text-center" style={cardStyle}>
                <Users className="mx-auto mb-2" size={32} color={C.orange} />
                <div className="text-sm font-bold" style={{ color: C.navy }}>
                  Do'stlarni taklif qiling
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Har bir do'st uchun +{REFERRAL_BONUS} ball, kirganga +{SIGNUP_BONUS} ball
                </div>
              </div>

              <div className="p-4" style={cardStyle}>
                <div className="text-xs font-bold text-gray-400 uppercase">
                  Sizning havolangiz
                </div>
                <div className="text-xs break-all bg-gray-50 p-2.5 rounded-xl mt-2 border select-all">
                  {referralLink || "Yuklanmoqda..."}
                </div>

                <button
                  onClick={copyReferralLink}
                  className="w-full mt-3 py-2 text-sm font-bold rounded-xl text-white flex items-center justify-center gap-2"
                  style={{ background: gradient }}
                >
                  <Copy size={16} />
                  {copied ? "Nusxalandi!" : "Havolani nusxalash"}
                  </button>

                <div className="mt-3 text-sm" style={{ color: C.navy }}>
                  Taklif qilgan do'stlar:{" "}
                  <span style={{ fontWeight: 800 }}>{referralCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* TASKS */}
          {tab === "tasks" && (
            <div className="space-y-3">
              {tasks.map((task) => {
                const done = state.completedTasks.includes(task.id);

                return (
                  <div
                    key={task.id}
                    className="p-4 flex items-center justify-between gap-3"
                    style={cardStyle}
                  >
                    <div className="min-w-0">
                      <div
                        className="text-sm font-bold truncate"
                        style={{ color: C.navy }}
                      >
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {task.desc}
                      </div>
                      <div className="text-xs mt-1" style={{ color: C.orange, fontWeight: 800 }}>
                        +{task.bonus} ball
                      </div>
                    </div>

                    {done ? (
                      <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm shrink-0">
                        <CheckCircle2 size={18} />
                        Bajarilgan
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 shrink-0">
                        <a
                          href={task.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-2 font-bold rounded-lg text-white text-center"
                          style={{ background: gradient }}
                        >
                          O‘tish
                        </a>
                        <button
                          onClick={() => completeTask(task)}
                          className="text-xs px-3 py-2 font-bold rounded-lg border"
                          style={{
                            borderColor: C.orange,
                            color: C.orange,
                            background: "#fff",
                          }}
                        >
                          Tekshirish
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {isAdmin && (
                <div className="p-4 mt-4" style={cardStyle}>
                  <div
                    className="flex items-center gap-2 mb-3"
                    style={{ color: C.navy, fontWeight: 800 }}
                  >
                    <Settings size={18} color={C.orange} />
                    Vazifa qo'shish (Admin)
                  </div>

                  <input
                    type="text"
                    placeholder="Vazifa nomi"
                    value={newTask.title}
                    onChange={(e) =>
                      setNewTask((s) => ({ ...s, title: e.target.value }))
                    }
                    style={inputStyle}
                  />

                  <input
                    type="text"
                    placeholder="@kanal_username"
                    value={newTask.channelUsername}
                    onChange={(e) =>
                      setNewTask((s) => ({
                        ...s,
                        channelUsername: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  />

                  <input
                    type="number"
                    placeholder="Bonus ball"
                    value={newTask.bonus}
                    onChange={(e) =>
                      setNewTask((s) => ({ ...s, bonus: e.target.value }))
                    }
                    style={inputStyle}
                  />

                  <button
                    onClick={addChannelTask}
                    className="w-full mt-3 py-2 text-sm font-bold rounded-xl text-white flex items-center justify-center gap-2"
                    style={{ background: gradient }}
                  >
                    <Plus size={16} />
                    Vazifa qo'shish
                  </button>

                  <div className="mt-4 space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id + "_admin"}
                        className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl p-2"
                      >
                        <div className="text-xs min-w-0">
                          <div className="font-bold truncate">{task.title}</div>
                          <div className="text-gray-400 truncate">{task.channel}</div>
                        </div>
                        <button
                          onClick={() => removeTask(task.id)}
                          className="p-2 rounded-lg"
                          style={{ color: "#EF4444" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WALLET */}
          {tab === "wallet" && (
            <div className="space-y-4">
              <div className="p-4" style={cardStyle}>
                <div className="text-sm font-bold mb-3" style={{ color: C.navy }}>
                  UC yechib olish
                </div>

                <input
                  type="text"
                  placeholder="PUBG ID kiriting"
                  value={ucId}
                  onChange={(e) => setUcId(e.target.value)}
                  style={inputStyle}
                />

                <input
                  type="number"
                  placeholder="Yechiladigan ball miqdori"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={inputStyle}
                />

                {liveUC > 0 && (
                  <div className="text-xs font-bold text-emerald-600 mt-2">
                    Siz olasiz: {liveUC} UC
                  </div>
                )}

                <button
                  onClick={submitWithdraw}
                  className="w-full mt-3 py-2.5 text-sm font-bold rounded-xl text-white flex items-center justify-center gap-2"
                  style={{ background: gradient }}
                >
                  <Send size={16} />
                  So'rov yuborish
                </button>
              </div>

              <div className="p-4" style={cardStyle}>
                <div
                  className="flex items-center gap-2 mb-3"
                  style={{ color: C.navy, fontWeight: 800 }}
                >
                  <Clock size={18} color={C.orange} />
                  Yechish tarixi
                </div>

                {state.withdrawals.length === 0 ? (
                  <div className="text-sm text-gray-400">
                    Hali yechish so'rovlari yo'q
                  </div>
                ) : (
                  <div className="space-y-3">
                    {state.withdrawals.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl p-3 border"
                        style={{ borderColor: "#E2E8F0" }}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="text-sm font-bold"
                            style={{ color: C.navy }}
                          >
                            {item.ball} ball → {item.uc} UC
                          </div>
                          <div
                            className="text-xs px-2 py-1 rounded-full"
                            style={{
                              backgroundColor: "#FEF3C7",
                              color: "#92400E",
                              fontWeight: 700,
                            }}
                          >
                            {item.status}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          PUBG ID: {item.ucId}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {item.date}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* bottom nav */}
        <div
          className="fixed bottom-0 left-0 right-0 max-w-sm mx-auto border-t px-2 py-2 flex items-center"
          style={{
            backgroundColor: "#fff",
            borderColor: "#F1F5F9",
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <NavButton
            active={tab === "home"}
            onClick={() => setTab("home")}
            icon={<Home size={20} />}
            label="Asosiy"
          />
          <NavButton
            active={tab === "referal"}
            onClick={() => setTab("referal")}
            icon={<Users size={20} />}
            label="Referal"
          />
          <NavButton
            active={tab === "tasks"}
            onClick={() => setTab("tasks")}
            icon={<ClipboardList size={20} />}
            label="Vazifalar"
          />
          <NavButton
            active={tab === "wallet"}
            onClick={() => setTab("wallet")}
            icon={<Wallet size={20} />}
            label="Hamyon"
          />
        </div>
      </div>
    </div>
  );
                }
