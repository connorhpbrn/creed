import { escapeHtml } from "@/lib/rich-text";

// Branded HTML for the Company invite email. Matches
// supabase/email-templates/confirm-signup.html byte-for-byte in structure:
// 460px table, Geist, brandmark header, #1a1a18 heading, #56564f body, a
// #2563EB rounded-[10px] button, an ignore note, and the Privacy/Terms footer.
// Light-mode only (email clients), no em dashes.

export type CompanyInviteEmailInput = {
  companyName: string;
  inviterName: string;
  acceptUrl: string;
  siteUrl: string;
};

export function companyInviteSubject(companyName: string): string {
  return `Join ${companyName} on Creed`;
}

export function renderCompanyInviteEmail(input: CompanyInviteEmailInput): string {
  const company = escapeHtml(input.companyName);
  const inviter = escapeHtml(input.inviterName);
  const acceptUrl = escapeHtml(input.acceptUrl);
  const siteUrl = escapeHtml(input.siteUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${company} on Creed</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" />
  </head>
  <body style="margin:0; padding:0; background-color:#ffffff; -webkit-font-smoothing:antialiased; -webkit-text-size-adjust:100%;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all; color:#ffffff; font-size:1px; line-height:1px;">
      ${inviter} invited you to the ${company} Creed.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
      <tr>
        <td align="center" style="padding:56px 24px;">
          <table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" style="width:460px; max-width:460px;">
            <tr>
              <td style="padding-bottom:40px;">
                <img src="${siteUrl}/assets/brand/brandmark-email.png" alt="Creed" width="85" height="20" style="width:85px; height:20px; display:block; border:0;" />
              </td>
            </tr>
            <tr>
              <td style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; color:#1a1a18; padding-bottom:12px;">
                Join ${company} on Creed
              </td>
            </tr>
            <tr>
              <td style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#56564f; padding-bottom:28px;">
                ${inviter} invited you to the ${company} Creed, the shared context file their AI agents read before they work.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#2563EB;">
                      <a href="${acceptUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:10px;">
                        Accept invite
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.65; color:#9a9a92; padding-bottom:28px;">
                If you were not expecting this, you can safely ignore this email.
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #ededea; padding-top:20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; color:#a8a89f;">
                      &copy; 2026 Creed
                    </td>
                    <td align="right" style="font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; color:#a8a89f;">
                      <a href="${siteUrl}/privacy" target="_blank" style="color:#a8a89f; text-decoration:none;">Privacy</a>
                      &nbsp;&nbsp;
                      <a href="${siteUrl}/terms" target="_blank" style="color:#a8a89f; text-decoration:none;">Terms</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
