
require("dotenv").config();

const {
  sendEmail,
  verifyEmailConnection
} = require("./config/mailer");

async function testEmail() {
  try {
    console.log("Checking Gmail SMTP connection...");

    await verifyEmailConnection();
    console.log("Gmail SMTP connection successful!");

    const result = await sendEmail({
      to: process.env.EMAIL_USER,
      subject: "Gyansify HRMS - Email Test",
      text: "Your Gyansify HRMS email configuration is working.",
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px">
          <h2>Gyansify HRMS</h2>
          <p>Your email configuration is working successfully.</p>
          <p>You can now proceed with employee invitation emails.</p>
        </div>
      `
    });

    console.log("Test email sent successfully!");
    console.log("Message ID:", result.messageId);
  } catch (error) {
    console.error("Email test failed:", error.message);
    process.exitCode = 1;
  }
}

testEmail();