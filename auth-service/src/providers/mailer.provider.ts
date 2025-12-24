

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerProvider {
  private readonly logger = new Logger(MailerProvider.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAILER_HOST,
      port: Number(process.env.MAILER_PORT) || 587,
      secure: Number(process.env.MAILER_PORT) === 465, // use TLS for 465
      auth: {
        user: process.env.MAILER_USER,
        pass: process.env.MAILER_PASS,
      },
    });
  }

  /** Generic send method */
  async sendMail(to: string, subject: string, text: string, html?: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.MAILER_FROM,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`✅ Email sent to ${to} with subject: ${subject}`);
    } catch (error) {
      this.logger.error('❌ Failed to send email', error.stack);
      throw error;
    }
  }

  /** ==============================
   * OTP Email Template
   * ============================== */
  async sendOtpEmail(to: string, otp: string) {
    const subject = 'Verify your account - Meal delivery System';
    const text = `Your OTP code is ${otp}. It expires in 10 minutes.`;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); padding: 20px; }
        .header { text-align: center; padding: 20px; background: #4f46e5; color: #fff; border-radius: 8px 8px 0 0; }
        .otp { font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #4f46e5; margin: 20px 0; text-align: center; }
        .footer { font-size: 12px; text-align: center; color: #777; margin-top: 30px; }
        .btn { display:inline-block; background:#4f46e5; color:#fff; padding:10px 20px; text-decoration:none; border-radius:6px; margin:20px auto; text-align:center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Meal delivery System Verification</h2>
        </div>
        <p>Hello,</p>
        <p>We received a request to verify your account. Use the OTP code below to complete your verification:</p>
        <div class="otp">${otp}</div>
        <p>This code is valid for <strong>10 minutes</strong>.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p>Thank you,<br/>Meal delivery System Team</p>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Meal delivery System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    return this.sendMail(to, subject, text, html);
  }

  async sendPasswordResetEmail(to: string, otp: string) {
    const subject = 'Reset your password - ERP System';
    const text = `Your password reset OTP is ${otp}. It expires in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto;">
        <h2>Password reset</h2>
        <p>Use the OTP below to reset your password:</p>
        <div style="font-size:24px; font-weight:bold; letter-spacing:4px;">${otp}</div>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `;
    return this.sendMail(to, subject, text, html);
  }
}
