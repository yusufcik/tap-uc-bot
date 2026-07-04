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
const BOT_TOKEN = "shu8790946212:AAGDGFUHWaj_iFiwZ8xRIlTV-3t9qnLlbDE"; // BotFather token
const BOT_USERNAME = "Tapucrobot"; // @ belgisisiz
const ADMIN_CHAT_ID = "7060092076"; // admin telegram id
const CHANNEL_USERNAME = "@tapuckanal"; // default kanal

const DAILY_LIMIT = 200;
const REFERRAL_BONUS = 50;
const SIGNUP_BONUS = 50;
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

  const isAdmin = Boolean(
    myId && ADMIN_CHAT_ID && String(myId) === String(ADMIN_CHAT_ID)
  );

  const showNotice = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => {
      setNotice((current) => (current?.text === text ? null : current));
    }, 2500);
  };

  /* ---------- Telegram / guest ---------- */
  useEffect(() => {
    const tg = getTelegram();
    tg?.ready?.();

    const tgUser = tg?.initDataUnsafe?.user;
    if (tgUser?.id) {
      setMyId(String(tgUser.id));
      setMyName(
        tgUser.username
          ? `@${tgUser.username}`
          : tgUser.first_name || "Foydalanuvchi"
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

  /* ---------- load state ---------- */
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

  /* ---------- referral apply ---------- */
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

          showNotice(
            "success",
            `Xush kelibsiz! +${SIGNUP_BONUS} ball qo'shildi`
          );
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

  /* ---------- notify admin ---------- */
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

  /* ---------- complete task ---------- */
  const completeTask = async (task) => {
    if (state.completedTasks.includes(task.id)) return;

    if (
      BOT_TOKEN &&
      BOT_TOKEN !== "TOKEN_HERE" &&
      myId &&
      !String(myId).startsWith("guest_")
    ) {
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
          showNotice(
            "error",
            "Avval kanalga obuna bo'ling, keyin qayta tekshiring"
          );
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

  /* ---------- copy referral ---------- */
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

  const tapProgress = Math.min(100, (state.dailyTaps / DAILY_LIMIT) * 100);
  const liveUC = amount ? estimateUC(parseInt(amount, 10) || 0) : 0;
  const referralLink = myId
    ? `https://t.me/${BOT_USERNAME}?start=ref_${myId}`
    : "";

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
        <div className="px-4 pt-2 pb-24" style={{ minHeight: 500 }}>{/* HOME */}
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 text-center" style={cardStyle}>
                  <div className="text-xs text-gray-400 font-bold uppercase">
                    Takliflar soni
                  </div>
                  <div className="text-2xl mt-1" style={{ color: C.navy, fontWeight: 900 }}>
                    {referralCount}
                  </div>
                </div>

                <div className="p-4 text-center" style={cardStyle}>
                  <div className="text-xs text-gray-400 font-bold uppercase">
                    Ishlangan bonus
                  </div>
                  <div className="text-2xl mt-1" style={{ color: C.orange, fontWeight: 900 }}>
                    {referralCount * REFERRAL_BONUS}
                  </div>
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
                  <div key={task.id} className="p-4 flex items-center gap-3" style={cardStyle}>
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: C.amber }}
                    >
                      <Gift size={22} color={C.orange} />
                    </div>

                    <div className="flex-1">
                      <div className="text-sm" style={{ color: C.navy, fontWeight: 700 }}>
                        {task.title}
                      </div>
                      <div className="text-xs" style={{ color: "#94A3B8" }}>
                        {task.desc}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: C.orangeDark, fontWeight: 800 }}>
                        +{task.bonus} ball
                      </div>
                    </div>

                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: "#10B981" }}>
                        <CheckCircle2 size={16} /> Bajarildi
                      </span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <a
                          href={task.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-center px-2.5 py-1.5"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: C.navy,
                            backgroundColor: "#F1F5F9",
                            borderRadius: 8,
                          }}
                        >
                          O'tish
                        </a>

                        <button
                          onClick={() => completeTask(task)}
                          className="px-2.5 py-1.5"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#fff",
                            background: gradient,
                            borderRadius: 8,
                          }}
                        >
                          Tekshirish
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* WITHDRAW */}
          {tab === "withdraw" && (
            <div className="space-y-4">
              <div className="p-4 text-center" style={cardStyle}>
                <div className="text-sm" style={{ color: "#94A3B8" }}>
                  Mavjud balans
                </div>
                <div className="text-2xl mt-1" style={{ color: C.navy, fontWeight: 900 }}>
                  {state.balance} <span style={{ color: C.orange }}>ball</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {TIERS.map((t) => (
                  <div key={t.ball} className="p-3 text-center" style={cardStyle}>
                    <div className="text-sm" style={{ color: C.navy, fontWeight: 700 }}>
                      {t.ball} ball
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                      teng keladi
                    </div>
                    <div className="text-lg mt-1" style={{ color: C.orange, fontWeight: 900 }}>
                      {t.uc} UC
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 space-y-3" style={cardStyle}>
                <div>
                  <label className="text-xs uppercase tracking-wide" style={{ color: "#94A3B8", fontWeight: 700 }}>
                    PUBG ID raqamingiz
                  </label>
                  <input
                    value={ucId}
                    onChange={(e) => setUcId(e.target.value)}
                    inputMode="numeric"
                    placeholder="Masalan: 5123456789"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-wide" style={{ color: "#94A3B8", fontWeight: 700 }}>
                    Necha ball sarflamoqchisiz
                  </label>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="Masalan: 1000"
                    style={inputStyle}
                  />
                  {amount ? (
                    <div className="text-xs mt-1.5" style={{ color: "#94A3B8" }}>
                      Taxminiy:{" "}
                      <span style={{ color: C.orangeDark, fontWeight: 700 }}>
                        {liveUC} UC
                      </span>
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={submitWithdraw}
                  className="w-full flex items-center justify-center gap-2 py-3 transition-transform"
                  style={{
                    background: gradient,
                    color: "#fff",
                    fontWeight: 800,
                    borderRadius: 12,
                    boxShadow: orangeShadow,
                  }}
                >
                  <Send size={18} />
                  So'rov yuborish
                </button>
              </div>

              {state.withdrawals.length > 0 && (
                <div className="p-4" style={cardStyle}>
                  <div className="text-sm mb-3" style={{ color: C.navy, fontWeight: 700 }}>
                    So'rovlar tarixi
                  </div>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {state.withdrawals.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl"
                        style={{ backgroundColor: "#F8FAFC" }}
                      >
                        <div>
                          <div className="text-sm" style={{ color: C.navy, fontWeight: 700 }}>
                            {w.ball} ball → {w.uc} UC
                          </div>
                          <div className="text-xs" style={{ color: "#94A3B8" }}>
                            ID: {w.ucId}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-xs font-bold" style={{ color: "#F59E0B" }}>
                          <Clock size={13} />
                          {w.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ADMIN */}
          {tab === "admin" && isAdmin && (
            <div className="space-y-4">
              <div className="p-4" style={cardStyle}>
                <div className="mb-3 flex items-center gap-2" style={{ color: C.navy, fontWeight: 800 }}>
                  <Settings size={18} color={C.orange} />
                  Yangi kanal vazifasi qo'shish
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase tracking-wide" style={{ color: "#94A3B8", fontWeight: 700 }}>
                      Sarlavha (ixtiyoriy)
                    </label>
                    <input
                      value={newTask.title}
                      onChange={(e) =>
                        setNewTask((t) => ({ ...t, title: e.target.value }))
                      }
                      placeholder="Masalan: Yangiliklar kanaliga obuna bo'ling"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wide" style={{ color: "#94A3B8", fontWeight: 700 }}>
                      Kanal username
                    </label>
                    <input
                      value={newTask.channelUsername}
                      onChange={(e) =>
                        setNewTask((t) => ({
                          ...t,
                          channelUsername: e.target.value,
                        }))
                      }
                      placeholder="Masalan: mening_kanalim"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wide" style={{ color: "#94A3B8", fontWeight: 700 }}>
                      Necha ball beriladi
                    </label>
                    <input
                      value={newTask.bonus}
                      onChange={(e) =>
                        setNewTask((t) => ({
                          ...t,
                          bonus: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      inputMode="numeric"
                      placeholder="Masalan: 30"
                      style={inputStyle}
                    />
                  </div>

                  <button
                    onClick={addChannelTask}
                    className="w-full flex items-center justify-center gap-2 py-3 transition-transform"
                    style={{
                      background: gradient,
                      color: "#fff",
                      fontWeight: 800,
                      borderRadius: 12,
                      boxShadow: orangeShadow,
                    }}
                  >
                    <Plus size={18} />
                    Vazifa qo'shish
                  </button>
                </div>
              </div>

              <div className="p-4" style={cardStyle}>
                <div className="text-sm mb-3" style={{ color: C.navy, fontWeight: 700 }}>
                  Hozirgi vazifalar
                </div>

                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl"
                      style={{ backgroundColor: "#F8FAFC" }}
                    >
                      <div>
                        <div className="text-sm" style={{ color: C.navy, fontWeight: 700 }}>
                          {t.title}
                        </div>
                        <div className="text-xs" style={{ color: "#94A3B8" }}>
                          {t.channel || CHANNEL_USERNAME} · +{t.bonus} ball
                        </div>
                      </div>

                      <button
                        onClick={() => removeTask(t.id)}
                        className="p-1.5"
                        style={{ color: "#F87171" }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                  {tasks.length === 0 && (
                    <div className="text-sm text-center py-3" style={{ color: "#94A3B8" }}>
                      Hozircha vazifa yo'q
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* bottom nav */}
        <div
          className="fixed bottom-0 left-0 right-0 max-w-sm mx-auto px-2 py-2 flex justify-around border-t"
          style={{ backgroundColor: C.card, borderColor: "#F1F5F9" }}
        >
          {[
            { key: "home", label: "Uy", icon: Home },
            { key: "referal", label: "Referal", icon: Users },
            { key: "tasks", label: "Vazifalar", icon: ClipboardList },
            { key: "withdraw", label: "Yechish", icon: Wallet },
            ...(isAdmin ? [{ key: "admin", label: "Admin", icon: Settings }] : []),
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setNotice(null);
              }}
              className="flex flex-col items-center gap-1 px-3 py-1"
            >
              <Icon size={22} color={tab === key ? C.orange : "#B5BCCB"} />
              <span
                className="text-xs font-semibold"
                style={{ color: tab === key ? C.orange : "#94A3B8" }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
                  }
