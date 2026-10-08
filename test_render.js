fetch("https://dreamappbackend.onrender.com/api/auth/signup/send-otp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test@example.com" })
}).then(res => res.text()).then(text => console.log(text));
