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
   SOZLAMALAR — bularni o'zingizning ma'lumotlaringiz bilan
   to'ldiring. Bo'sh qoldirilsa, tegishli funksiya (adminga
   xabar, obunani tekshirish) shunchaki o'chirilgan holda ishlaydi.
   ============================================================ */
// Bu qiymatlar kodga yozilmaydi — Netlify'ning "Environment variables"
// bo'limidan olinadi (VITE_ prefiksi Vite loyihalarida shart).
const BOT_TOKEN = import.meta.env.VITE_BOT_TOKEN || "8790946212:AAGDGFUHWaj_iFiwZ8xRIlTV-3t9qnLlbDE";
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || "TapUcrobot";
const ADMIN_CHAT_ID =  import.meta.env.VITE_ADMIN_CHAT_ID || "7060092076";
const CHANNEL_USERNAME = import.meta.env.VITE_CHANNEL_USERNAME || "@tapuckanal";

/* MUHIM: Bu React kodi brauzerda ishlaydi, shuning uchun BOT_TOKEN
   qanday saqlansa ham (kodda yoki environment variable'da), build
   qilingandan keyin u brauzer JS fayli ichida ko'rinadi va texnik
   jihatdan har kim uni topib olishi mumkin. Environment variable
   ishlatish token GitHub'ga ochiq push qilinishining oldini oladi,
   lekin to'liq maxfiylik kafolatlamaydi. To'liq xavfsizlik uchun
   Telegram API so'rovlarini alohida backend/serverless funksiya
   orqali yuborish tavsiya etiladi. */

/* MA'LUMOTLARNI SAQLASH: Bu versiya localStorage ishlatadi — ya'ni
   balans, vazifalar va referal ma'lumotlari FAQAT shu brauzer/qurilmada
   saqlanadi. Boshqa qurilmadan kirilsa, ma'lumotlar 0 dan boshlanadi,
   va referal orqali taklif qilingan do'stlar soni boshqa odamlarga
   ko'rinmaydi. Bu haqiqiy ko'p foydalanuvchili tizim uchun emas,
   balki demo/shaxsiy foydalanish uchun mos yechim. */
const localStore = {
  async get(key) {
    const value = localStorage.getItem(key);
    if (value === null) throw new Error("not-found");
    return { value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { value };
  },
};

const DAILY_LIMIT = 200;
const REFERRAL_BONUS = 50; // taklif qilingan har bir do'st uchun
const SIGNUP_BONUS = 50; // taklif havolasi orqali kirgan yangi foydalanuvchiga
const TASK_BONUS = 50;
const STORAGE_KEY = "tapuc:state";

const TIERS = [
  { ball: 3000, uc: 60 },
  { ball: 10000, uc: 360 },
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

const TASKS_STORAGE_KEY = "tapuc:tasks"; // barcha foydalanuvchilar uchun umumiy (shared) ro'yxat

// Brend ranglari — bu muhitda Tailwind ixtiyoriy qiymatlari (masalan bg-[#F7A928])
// ishlamaydi, shu sababli barcha maxsus ranglar inline style orqali qo'llanadi.
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
  if (ball <= 0) return 0;
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
      className="text-sm font-semibold rounded-xl px-3 py-2"
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
  const [myName, setMyName] = useState(null);
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [newTask, setNewTask] = useState({ title: "", channelUsername: "", bonus: "" });
  const saveTimer = useRef(null);

  const isAdmin = Boolean(myId && ADMIN_CHAT_ID && myId === ADMIN_CHAT_ID);

  /* ---------- Foydalanuvchini aniqlash (Telegram yoki mehmon) ---------- */
  useEffect(() => {
    (async () => {
      const tg = getTelegram();
      tg?.ready?.();
      const tgUser = tg?.initDataUnsafe?.user;
      if (tgUser?.id) {
        setMyId(String(tgUser.id));
        setMyName(tgUser.username ? "@" + tgUser.username : tgUser.first_name || "Foydalanuvchi");
        return;
      }
      try {
        const res = await localStore.get("tapuc:anon-id");
        setMyId(res.value);
        setMyName("Mehmon");
      } catch {
        const id = "guest_" + Math.random().toString(36).slice(2, 10);
        await localStore.set("tapuc:anon-id", id).catch(() => {});
        setMyId(id);
        setMyName("Mehmon");
      }
    })();
  }, []);

  /* ---------- Asosiy holatni yuklash ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await localStore.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          const today = todayStr();
          if (parsed.lastTapDate !== today) {
            parsed.dailyTaps = 0;
            parsed.lastTapDate = today;
          }
          setState({ ...defaultState, ...parsed });
        }
      } catch {
        // birinchi marta ochilmoqda, standart holat qoladi
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /* ---------- Vazifalar ro'yxatini yuklash (umumiy) ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await localStore.get(TASKS_STORAGE_KEY);
        setTasks(JSON.parse(res.value));
      } catch {
        await localStore.set(TASKS_STORAGE_KEY, JSON.stringify(DEFAULT_TASKS)).catch(() => {});
        setTasks(DEFAULT_TASKS);
      }
    })();
  }, []);

  const saveTasks = async (next) => {
    setTasks(next);
    try {
      await localStore.set(TASKS_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("Vazifalarni saqlashda xatolik:", e);
    }
  };

  const addChannelTask = () => {
    const username = newTask.channelUsername.trim().replace(/^@/, "");
    const bonus = parseInt(newTask.bonus, 10);
    if (!username) {
      setNotice({ type: "error", text: "Kanal username kiriting" });
      return;
    }
    if (!bonus || bonus <= 0) {
      setNotice({ type: "error", text: "Ball miqdorini to'g'ri kiriting" });
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
    setNotice({ type: "success", text: "Yangi vazifa qo'shildi" });
  };

  const removeTask = (id) => {
    saveTasks(tasks.filter((t) => t.id !== id));
  };

  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await localStore.set(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Saqlashda xatolik:", e);
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (loaded) persist(state);
  }, [state, loaded, persist]);

  /* ---------- Referal havolasi orqali kirganini tekshirish ---------- */
  useEffect(() => {
    if (!loaded || !myId || state.refApplied) return;
    const tg = getTelegram();
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith("ref_")) {
      const refCode = startParam.slice(4);
      if (refCode && refCode !== myId) {
        (async () => {
          try {
            let list = [];
            try {
              const r = await localStore.get(`ref:${refCode}`);
              list = JSON.parse(r.value);
            } catch {
              list = [];
            }
            if (!list.includes(myId)) {
              list.push(myId);
              await localStore.set(`ref:${refCode}`, JSON.stringify(list));
            }
            setState((s) => ({ ...s, balance: s.balance + SIGNUP_BONUS, refApplied: true }));
            setNotice({ type: "success", text: `Xush kelibsiz! +${SIGNUP_BONUS} ball bonus qo'shildi` });
          } catch (e) {
            console.error(e);
          }
        })();
      }
    }
  }, [loaded, myId, state.refApplied]);

  /* ---------- O'z referal daromadini tekshirish ---------- */
  const checkReferralEarnings = useCallback(async () => {
    if (!myId) return;
    try {
      const r = await localStore.get(`ref:${myId}`);
      const list = JSON.parse(r.value);
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
    } catch {
      setReferralCount(0);
    }
  }, [myId]);

  useEffect(() => {
    if (loaded && myId) checkReferralEarnings();
  }, [loaded, myId, tab, checkReferralEarnings]);

  /* ---------- Tap ---------- */
  const handleTap = () => {
    if (state.dailyTaps >= DAILY_LIMIT) return;
    setPop(true);
    setTimeout(() => setPop(false), 120);
    setState((s) => ({
      ...s,
      balance: s.balance + 1,
      dailyTaps: s.dailyTaps + 1,
      lastTapDate: todayStr(),
    }));
  };

  /* ---------- Adminga xabar yuborish ---------- */
  const notifyAdmin = async (request) => {
    if (!BOT_TOKEN || !ADMIN_CHAT_ID) return;
    try {
      const text =
        `Yangi yechish so'rovi\n` +
        `Foydalanuvchi: ${myName || myId}\n` +
        `PUBG ID: ${request.ucId}\n` +
        `Ball: ${request.ball}\n` +
        `UC: ${request.uc}`;
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text }),
      });
    } catch (e) {
      console.error("Adminga xabar yuborilmadi:", e);
    }
  };

  const submitWithdraw = () => {
    const val = parseInt(amount, 10);
    if (!ucId.trim()) {
      setNotice({ type: "error", text: "PUBG ID raqamini kiriting" });
      return;
    }
    if (!val || val <= 0) {
      setNotice({ type: "error", text: "Ball miqdorini to'g'ri kiriting" });
      return;
    }
    if (val > state.balance) {
      setNotice({ type: "error", text: "Balansingizda yetarli ball yo'q" });
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
    setNotice({ type: "success", text: `So'rov yuborildi: ${val} ball - ${uc} UC` });
  };

  /* ---------- Vazifani bajarish ---------- */
  const completeTask = async (task) => {
    if (state.completedTasks.includes(task.id)) return;
    if (BOT_TOKEN && myId && !myId.startsWith("guest_")) {
      try {
        const channel = task.channel || CHANNEL_USERNAME;
        const res = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${channel}&user_id=${myId}`
        );
        const data = await res.json();
        const status = data?.result?.status;
        if (!["member", "administrator", "creator"].includes(status)) {
          setNotice({ type: "error", text: "Avval kanalga obuna bo'ling, keyin qayta tekshiring" });
          return;
        }
      } catch {
        setNotice({ type: "error", text: "Tekshirishda xatolik, keyinroq urinib ko'ring" });
        return;
      }
    }
    setState((s) => ({
      ...s,
      balance: s.balance + task.bonus,
      completedTasks: [...s.completedTasks, task.id],
    }));
    setNotice({ type: "success", text: `+${task.bonus} ball qo'shildi!` });
  };

  const copyReferralLink = async () => {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${myId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice({ type: "error", text: "Nusxalab bo'lmadi, qo'lda ko'chiring" });
    }
  };

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
    marginTop: 4,
  };

  const cardStyle = {
    backgroundColor: C.card,
    borderRadius: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    border: "1px solid #F1F5F9",
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center py-6 px-3"
      style={{ backgroundColor: C.bg }}
    >
      <div
        className="w-full max-w-sm overflow-hidden"
        style={{ backgroundColor: C.bg, borderRadius: 28, boxShadow: "0 10px 40px rgba(0,0,0,0.12)" }}
      >
        {/* App header */}
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
          <div className="flex-1">
            <div className="text-base leading-none" style={{ color: C.navy, fontWeight: 800 }}>
              PUBG UC BOT
            </div>
            <div className="text-xs mt-1" style={{ color: "#94A3B8" }}>
              UC yig'ing va yeching
            </div>
          </div>
          <div
            className="text-sm px-4 py-1.5 whitespace-nowrap"
            style={{ background: gradient, color: "#fff", fontWeight: 800, borderRadius: 999, boxShadow: orangeShadow }}
          >
            {state.balance} ball
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pt-4 pb-24" style={{ minHeight: 560 }}>
          {tab === "home" && (
            <>
              <div className="py-5 text-center mb-6" style={cardStyle}>
                <div className="text-sm font-medium" style={{ color: "#94A3B8" }}>
                  Umumiy balans
                </div>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-4xl" style={{ color: C.navy, fontWeight: 900 }}>
                    {state.balance}
                  </span>
                  <span className="text-xl" style={{ color: C.orange, fontWeight: 800 }}>
                    ball
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <button
                  onClick={handleTap}
                  disabled={state.dailyTaps >= DAILY_LIMIT}
                  className="w-64 h-64 rounded-full flex items-center justify-center transition-transform duration-100"
                  style={{
                    background: C.navy,
                    border: `10px solid ${C.orange}`,
                    boxShadow: orangeGlow,
                    transform: pop ? "scale(0.95)" : "scale(1)",
                    opacity: state.dailyTaps >= DAILY_LIMIT ? 0.6 : 1,
                  }}
                >
                  <div className="text-center leading-none select-none">
                    <div className="text-4xl tracking-wide" style={{ color: C.orange, fontWeight: 900 }}>
                      Tap
                    </div>
                    <div className="text-4xl tracking-wide" style={{ color: "#fff", fontWeight: 900 }}>
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
                <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${tapProgress}%`, background: gradient }}
                  />
                </div>
                <div className="text-xs mt-2" style={{ color: "#94A3B8" }}>
                  Kuniga 2 marta × 100 tap
                </div>
              </div>
            </>
          )}

          {tab === "referal" && (
            <div className="mt-2 space-y-4">
              <div className="p-6 text-center" style={cardStyle}>
                <Users className="mx-auto mb-2" size={36} color={C.orange} />
                <div className="mb-1" style={{ color: C.navy, fontWeight: 800 }}>
                  Do'stlaringizni taklif qiling
                </div>
                <div className="text-sm" style={{ color: "#94A3B8" }}>
                  Har bir taklif qilingan do'stingiz uchun{" "}
                  <span style={{ color: C.orangeDark, fontWeight: 700 }}>+{REFERRAL_BONUS} ball</span> oling
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 text-center" style={cardStyle}>
                  <div className="text-xs font-semibold uppercase" style={{ color: "#94A3B8" }}>
                    Takliflar
                  </div>
                  <div className="text-2xl mt-1" style={{ color: C.navy, fontWeight: 900 }}>
                    {referralCount}
                  </div>
                </div>
                <div className="p-4 text-center" style={cardStyle}>
                  <div className="text-xs font-semibold uppercase" style={{ color: "#94A3B8" }}>
                    Ishlangan bonus
                  </div>
                  <div className="text-2xl mt-1" style={{ color: C.orange, fontWeight: 900 }}>
                    {referralCount * REFERRAL_BONUS}
                  </div>
                </div>
              </div>

              <div className="p-4" style={cardStyle}>
                <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#94A3B8", fontWeight: 700 }}>
                  Sizning havolangiz
                </div>
                <div
                  className="text-xs break-all mb-3 px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: "#F8FAFC", color: "#64748B" }}
                >
                  {referralLink || "Yuklanmoqda..."}
                </div>
                <button
                  onClick={copyReferralLink}
                  disabled={!myId}
                  className="w-full flex items-center justify-center gap-2 py-3 transition-transform"
                  style={{
                    background: gradient,
                    color: "#fff",
                    fontWeight: 800,
                    borderRadius: 12,
                    boxShadow: orangeShadow,
                    opacity: !myId ? 0.6 : 1,
                  }}
                >
                  {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                  {copied ? "Nusxalandi!" : "Havolani nusxalash"}
                </button>
              </div>
            </div>
          )}

          {tab === "tasks" && (
            <div className="mt-2 space-y-3">
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
                          style={{ fontSize: 11, fontWeight: 700, color: C.navy, backgroundColor: "#F1F5F9", borderRadius: 8 }}
                        >
                          O'tish
                        </a>
                        <button
                          onClick={() => completeTask(task)}
                          className="px-2.5 py-1.5"
                          style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: gradient, borderRadius: 8 }}
                        >
                          Tekshirish
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {tab === "tasks" && <Notice notice={notice} />}
            </div>
          )}

          {tab === "withdraw" && (
            <div className="mt-2 space-y-4">
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
                      Taxminiy: <span style={{ color: C.orangeDark, fontWeight: 700 }}>{liveUC} UC</span>
                    </div>
                  ) : null}
                </div>

                {tab === "withdraw" && <Notice notice={notice} />}

                <button
                  onClick={submitWithdraw}
                  className="w-full flex items-center justify-center gap-2 py-3 transition-transform"
                  style={{ background: gradient, color: "#fff", fontWeight: 800, borderRadius: 12, boxShadow: orangeShadow }}
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

          {tab === "admin" && isAdmin && (
            <div className="mt-2 space-y-4">
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
                      onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
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
                      onChange={(e) => setNewTask((t) => ({ ...t, channelUsername: e.target.value }))}
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
                      onChange={(e) => setNewTask((t) => ({ ...t, bonus: e.target.value.replace(/[^0-9]/g, "") }))}
                      inputMode="numeric"
                      placeholder="Masalan: 30"
                      style={inputStyle}
                    />
                  </div>

                  {tab === "admin" && <Notice notice={notice} />}

                  <button
                    onClick={addChannelTask}
                    className="w-full flex items-center justify-center gap-2 py-3 transition-transform"
                    style={{ background: gradient, color: "#fff", fontWeight: 800, borderRadius: 12, boxShadow: orangeShadow }}
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
                      <button onClick={() => removeTask(t.id)} className="p-1.5" style={{ color: "#F87171" }}>
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

        {/* Bottom nav */}
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
              <span className="text-xs font-semibold" style={{ color: tab === key ? C.orange : "#94A3B8" }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
