import { $, fetchCurrentUser } from "./common.js";

let mode = new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login";

function applyMode() {
  const isRegister = mode === "register";
  $("authTitle").textContent = isRegister ? "ساخت حساب کاربری" : "ورود به حساب کاربری";
  $("authSub").textContent = isRegister
    ? "یک‌بار ثبت‌نام کن، دیگر لازم نیست اطلاعاتت را دوباره وارد کنی"
    : "برای دسترسی به پنل مالی‌ات وارد شو";
  $("nameField").classList.toggle("hidden", !isRegister);
  $("authPassword").autocomplete = isRegister ? "new-password" : "current-password";
  $("authSubmitBtn").textContent = isRegister ? "ثبت‌نام" : "ورود";
  $("authSwitchText").textContent = isRegister ? "قبلاً حساب ساخته‌ای؟" : "حساب کاربری نداری؟";
  $("authSwitchLink").textContent = isRegister ? "وارد شو" : "همین الان ثبت‌نام کن";
  $("authError").classList.add("hidden");
}

$("authSwitchLink").onclick = (e) => {
  e.preventDefault();
  mode = mode === "register" ? "login" : "register";
  applyMode();
};

$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = $("authSubmitBtn");
  const errEl = $("authError");
  errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = mode === "register" ? "در حال ثبت‌نام..." : "در حال ورود...";

  try {
    const body =
      mode === "register"
        ? { name: $("authName").value.trim(), email: $("authEmail").value.trim(), password: $("authPassword").value }
        : { email: $("authEmail").value.trim(), password: $("authPassword").value };

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "خطایی رخ داد.");

    window.location.href = mode === "register" ? "/panel/profile.html" : "/panel/dashboard.html";
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    btn.disabled = false;
    applyMode();
  }
};

applyMode();

// Already signed in? skip straight to the panel.
fetchCurrentUser().then((user) => {
  if (user) window.location.href = "/panel/dashboard.html";
});
