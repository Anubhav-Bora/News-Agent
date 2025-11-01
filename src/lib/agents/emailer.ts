import nodemailer from "nodemailer";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { readFile } from "fs/promises";

export interface EmailContent {
  subject: string;
  htmlBody: string;
  plainTextBody: string;
}

export interface Article {
  title: string;
  summary: string;
  source?: string;
  topic: string;
  sentiment: "positive" | "negative" | "neutral";
  pubDate: string;
}

export interface EmailAttachments {
  pdfUrl?: string;
  pdfPath?: string;
  audioUrl?: string;
  audioPath?: string;
  pdfFileName?: string;
  audioFileName?: string;
}

export interface EmailPreferenceResult {
  email: string | null;
  success: boolean;
  error?: {
    type: 'NOT_FOUND' | 'NETWORK_ERROR' | 'UNKNOWN';
    message: string;
  };
}

async function generateEmailContent(articles: Article[], userName: string): Promise<EmailContent> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.5,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const articlesJson = JSON.stringify(articles.slice(0, 5), null, 2);

  const promptTemplate = ChatPromptTemplate.fromTemplate(`Create a professional and engaging email for a news digest. Return ONLY valid JSON with no markdown:

User Name: {userName}
Top Articles: {articles}

Respond with ONLY this JSON format:
{{
  "subject": "Daily News Digest - [Date]",
  "htmlBody": "<html><body><h1>Hello {userName}!</h1><p>Your personalized news digest is ready. See attached PDF for full details and audio file for listening on the go.</p><hr/><h2>Highlights:</h2><ul>[article bullets here]</ul><p>Enjoy!</p></body></html>",
  "plainTextBody": "Hello {userName}!\\n\\nYour personalized news digest is ready. See attached PDF for full details and audio file for listening on the go.\\n\\nHighlights:\\n[article list here]\\n\\nEnjoy!"
}}

Make sure to:
- Include the user's name in the greeting
- Create an engaging subject line
- Mention PDF and audio attachments
- Format articles with their topics
- Add a professional footer
- Keep HTML clean and email-client compatible`);

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  const response = await chain.invoke({ 
    userName, 
    articles: articlesJson 
  });

  const cleanedResponse = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let emailContent: EmailContent;
  try {
    emailContent = JSON.parse(cleanedResponse);
  } catch {
    console.warn("Failed to parse email content from AI, using default");
    emailContent = {
      subject: `Daily News Digest - ${new Date().toLocaleDateString()}`,
      htmlBody: `<html><body><h1>Hello ${userName}!</h1><p>Your personalized news digest is ready. See attached PDF for full details and audio file for listening on the go.</p></body></html>`,
      plainTextBody: `Hello ${userName}!\n\nYour personalized news digest is ready. See attached PDF for full details and audio file for listening on the go.`,
    };
  }

  return emailContent;
}

async function prepareAttachments(attachments: EmailAttachments) {
  interface NodemailerAttachment {
    filename: string;
    content?: Buffer;
    path?: string;
  }
  const nodemailerAttachments: NodemailerAttachment[] = [];

  // Nodemailer supports both URLs and file buffers
  if (attachments.pdfPath) {
    try {
      const pdfBuffer = await readFile(attachments.pdfPath);
      nodemailerAttachments.push({
        filename: attachments.pdfFileName || "news-digest.pdf",
        content: pdfBuffer,
      });
      console.log(`✅ PDF attachment prepared: ${attachments.pdfFileName}`);
    } catch (err) {
      console.error(`❌ Error reading PDF file: ${err}`);
    }
  } else if (attachments.pdfUrl) {
    // Nodemailer can handle URLs directly
    nodemailerAttachments.push({
      filename: attachments.pdfFileName || "news-digest.pdf",
      path: attachments.pdfUrl,
    });
    console.log(`✅ PDF link added: ${attachments.pdfFileName}`);
  }

  if (attachments.audioPath) {
    try {
      const audioBuffer = await readFile(attachments.audioPath);
      nodemailerAttachments.push({
        filename: attachments.audioFileName || "news-digest.mp3",
        content: audioBuffer,
      });
      console.log(`✅ Audio attachment prepared: ${attachments.audioFileName}`);
    } catch (err) {
      console.error(`❌ Error reading audio file: ${err}`);
    }
  } else if (attachments.audioUrl) {
    // Nodemailer can handle URLs directly
    nodemailerAttachments.push({
      filename: attachments.audioFileName || "news-digest.mp3",
      path: attachments.audioUrl,
    });
    console.log(`✅ Audio link added: ${attachments.audioFileName}`);
  }

  return nodemailerAttachments;
}

export async function sendEmailDigest(
  recipientEmail: string,
  articles: Article[],
  userName: string,
  attachments?: EmailAttachments
): Promise<boolean> {
  try {
    // Check for required environment variables
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("⚠️ SMTP credentials not configured. Skipping email send.");
      console.warn("Required: SMTP_HOST, SMTP_USER, SMTP_PASS");
      return false;
    }

    console.log(`📧 Generating email content for ${userName}...`);
    const emailContent = await generateEmailContent(articles, userName);

    // Create Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const attachmentsList = attachments ? await prepareAttachments(attachments) : [];

    // Get sender email from env or use SMTP user
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

    const mailOptions = {
      from: fromEmail,
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.htmlBody,
      text: emailContent.plainTextBody,
      attachments: attachmentsList.length > 0 ? attachmentsList : undefined,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent successfully to ${recipientEmail}`);
    console.log(`📨 Message ID: ${info.messageId}`);
    console.log(`📎 Attachments: ${attachmentsList.length}`);

    return true;
  } catch (err) {
    console.error("❌ Error sending email:", err);
    throw err;
  }
}

export async function sendDigestWithPdfAndAudio(
  recipientEmail: string,
  articles: Article[],
  userName: string,
  pdfUrl: string,
  audioUrl: string,
  pdfFileName: string = "news-digest.pdf",
  audioFileName: string = "news-digest.mp3"
): Promise<boolean> {
  return await sendEmailDigest(recipientEmail, articles, userName, {
    pdfUrl,
    audioUrl,
    pdfFileName,
    audioFileName,
  });
}

export async function sendDigestWithLocalFiles(
  recipientEmail: string,
  articles: Article[],
  userName: string,
  pdfPath: string,
  audioPath: string,
  pdfFileName: string = "news-digest.pdf",
  audioFileName: string = "news-digest.mp3"
): Promise<boolean> {
  return await sendEmailDigest(recipientEmail, articles, userName, {
    pdfPath,
    audioPath,
    pdfFileName,
    audioFileName,
  });
}

export async function sendBulkEmailDigests(
  recipients: { email: string; name: string }[],
  articles: Article[],
  attachments?: EmailAttachments
): Promise<{ successful: number; failed: number }> {
  let successful = 0;
  let failed = 0;

  console.log(`\n📧 Sending bulk emails to ${recipients.length} recipients...`);

  for (const recipient of recipients) {
    try {
      await sendEmailDigest(recipient.email, articles, recipient.name, attachments);
      successful++;
    } catch (err) {
      console.error(`Failed to send email to ${recipient.email}:`, err);
      failed++;
    }
  }

  console.log(`\n📊 Bulk email results: ✅ ${successful} sent, ❌ ${failed} failed`);
  return { successful, failed };
}

export async function getUserEmailPreference(userId: string): Promise<EmailPreferenceResult> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/email-preference`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.API_SECRET_KEY}`,
        "X-User-ID": userId,
      },
    });

    if (response.status === 404) {
      return {
        email: null,
        success: false,
        error: {
          type: 'NOT_FOUND',
          message: `User ${userId} has not set an email preference`
        }
      };
    }

    if (!response.ok) {
      return {
        email: null,
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: `API returned ${response.status}: ${response.statusText}`
        }
      };
    }

    const data = await response.json();
    return {
      email: data.email || null,
      success: true
    };
  } catch (err) {
    console.error("Error fetching email preference:", err);
    return {
      email: null,
      success: false,
      error: {
        type: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Unknown error occurred'
      }
    };
  }
}

export async function saveUserEmailPreference(userId: string, email: string): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/email-preference`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.API_SECRET_KEY}`,
        "X-User-ID": userId,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.warn(`⚠️ Could not save email preference for user ${userId}`);
      return false;
    }

    console.log(`✅ Email preference saved for user ${userId}`);
    return true;
  } catch (err) {
    console.error("Error saving email preference:", err);
    return false;
  }
}

