import { Agent, fetch as undiciFetch } from "undici";
import { ENV } from "./env";

const brevoDispatcher = new Agent({ connect: { family: 4 } });

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> {
  if (!ENV.brevoApiKey) {
    console.warn("[Email] BREVO_API_KEY not set, skipping email");
    return false;
  }
  try {
    const res = await undiciFetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      dispatcher: brevoDispatcher,
      headers: {
        "api-key": ENV.brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Rabbaanie", email: params.from || ENV.brevoSender },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[Email] Brevo error:", res.status, err);
      return false;
    }
    console.log("[Email] Sent to", params.to);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed:", error.message);
    return false;
  }
}
