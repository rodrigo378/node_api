import { MailService } from "../modules/mail/service";
import { env } from "../core/config/env";

// Uso: npm run test:mail -- destino@uma.edu.pe
async function main() {
  const destino = process.argv[2];

  console.log("Config SMTP:", {
    host: env.MAIL.HOST,
    port: env.MAIL.PORT,
    user: env.MAIL.USER ?? "(sin CORREO_OUTLOOK)",
    password: env.MAIL.PASSWORD ? "(definida)" : "(sin CLAVE_CORREO)",
    fromName: env.MAIL.FROM_NAME,
  });

  const service = new MailService();

  // 1. Handshake + login, sin enviar nada
  const check = await service.verificar();
  console.log("verificar():", check);
  if (!check.ok) process.exit(1);

  if (!destino) {
    console.log("OK conexion. Pasa un destinatario para enviar de verdad.");
    return;
  }

  // 2. Envio real
  const result = await service.enviar({
    to: destino,
    subject: "Prueba worker_sync",
    html: "<p>Correo de prueba desde worker_sync.</p>",
    text: "Correo de prueba desde worker_sync.",
  });

  console.log("enviar():", result);
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error("FALLO:", err);
  process.exit(1);
});
