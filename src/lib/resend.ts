import { Resend } from "resend";

// SERVER ONLY — never import from client components
export const resend = new Resend(process.env.RESEND_API_KEY!);
