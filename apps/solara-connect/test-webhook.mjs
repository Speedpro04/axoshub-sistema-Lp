const payload = {
  event: "messages.upsert",
  instance: "axos-evoapi",
  data: {
    message: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
      message: { conversation: "Oi, que dia tem consulta?" },
      pushName: "Cliente Teste"
    }
  }
};

const res = await fetch("http://localhost:3001/api/evolution/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // Autenticacao bypassada porque não declaramos a variavel EVOLUTION_WEBHOOK_TOKEN no .env
  },
  body: JSON.stringify(payload)
});

console.log("Status do Webhook:", res.status);
const txt = await res.text();
console.log("Resposta do Webhook:", txt);
