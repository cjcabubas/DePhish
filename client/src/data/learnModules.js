// Learn module content.
//
// quiz field on each section: array of { q, options, answer } where answer is
// the 0-based index of the correct option. Questions are taken verbatim from
// the DePhish course documents.

export const learnModules = [
  // ─── PHISHING ─────────────────────────────────────────────────────────────
  {
    id: 'phishing',
    icon: 'fish',
    tone: 'blue',
    title: 'Phishing',
    tagline: 'How fake emails try to trick you into clicking a malicious link or handing over your password.',
    provider: 'DePhish Academy',
    level: 'Beginner',
    duration: '60 minutes',
    sections: [
      {
        title: 'Understand the Threat',
        quiz: [
          { q: 'Which statement best defines phishing?', options: ['Any unwanted email', 'Deceptive communication intended to cause an unsafe action', 'Any email with a link', 'A network scan'], answer: 1 },
          { q: 'What makes spear phishing different?', options: ['It only uses SMS', 'It targets a specific person or group', 'It always contains malware', 'It cannot use fake websites'], answer: 1 },
          { q: 'Which is a weak trust signal?', options: ['Independent verification', 'A copied company logo', 'A known bookmark', 'A request confirmed in person'], answer: 1 },
          { q: 'What is the best first question when a message feels urgent?', options: ['How fast can I respond?', 'What action is the sender trying to make me perform?', 'Is the font correct?', 'Is the message long?'], answer: 1 },
        ],
        lessons: [
          { id: 'ph-what-is-phishing', title: 'What is phishing?', minutes: 4, status: 'done', body: ['Phishing is a form of social engineering that uses deceptive communication to cause an unsafe action. The attacker may want credentials, money, confidential information, malware execution, or access to an account.', 'Phishing is defined by deception and the requested action — not by whether the message contains bad grammar or a suspicious attachment.'] },
          { id: 'ph-types', title: 'Phishing, spam, spear phishing, and whaling', minutes: 5, status: 'done', body: ['Spam is usually unsolicited bulk communication, while phishing is designed to deceive a target into taking an action. Spear phishing is more targeted and may use information about a person, class, department, or organization.', 'Whaling refers to targeted phishing against senior or high-value personnel such as executives or people with payment authority.'] },
          { id: 'ph-why-it-works', title: 'Why phishing works', minutes: 4, status: 'done', body: ['Attackers often exploit normal human decision-making. Urgency, authority, fear, curiosity, familiarity, and convenience can reduce the time a person spends verifying a request.', 'A professional design or familiar logo can increase trust, but appearance alone is a weak trust signal.'] },
          { id: 'ph-first-check', title: 'A repeatable first check', minutes: 4, status: 'current', body: ['Before clicking or replying, ask four questions: Who is really asking? What action do they want? Why is the request happening now? Can the request be verified through an independent channel?', 'This short process helps separate emotional pressure from evidence.'] },
        ],
      },
      {
        title: 'Attack Lifecycle',
        quiz: [
          { q: 'What is a pretext?', options: ['A firewall rule', 'The story used to justify a requested action', 'A password hash', 'An email attachment type'], answer: 1 },
          { q: 'Why can reconnaissance make phishing more believable?', options: ['It encrypts the email', 'It gives attackers details that fit the target context', 'It blocks security tools', 'It changes DNS automatically'], answer: 1 },
          { q: 'What may need review after credentials are submitted to a phishing page?', options: ['Only screen brightness', 'Active sessions and account settings', 'Printer drivers', 'Keyboard language'], answer: 1 },
          { q: 'What is the defender goal when studying the attack lifecycle?', options: ['Copy the attack', 'Find opportunities to interrupt the attack', 'Disable all email', 'Ignore user context'], answer: 1 },
        ],
        lessons: [
          { id: 'ph-reconnaissance', title: 'Reconnaissance', minutes: 4, status: 'todo', body: ['Targeted phishing may begin with information gathered from public websites, social media, professional profiles, leaked data, or previous conversations. The purpose is to make the message fit the target environment.', 'Defenders should understand that accurate names, roles, or project details do not prove a message is legitimate.'] },
          { id: 'ph-pretext', title: 'Building the pretext', minutes: 4, status: 'todo', body: ['A pretext is the story used to justify the requested action. Common pretexts include password resets, invoices, shared documents, security alerts, payroll changes, and account verification.', 'Effective defense focuses on whether the requested action matches the organization\'s normal process.'] },
          { id: 'ph-delivery', title: 'Delivery and interaction', minutes: 4, status: 'todo', body: ['Phishing can be delivered by email, collaboration platforms, fake web pages, or compromised accounts. The visible message is only one part of the attack.', 'The goal is often to move the target to a malicious website, attachment, or conversation where information can be collected.'] },
          { id: 'ph-after-victim-acts', title: 'After the victim acts', minutes: 4, status: 'todo', body: ['After credentials are submitted, an attacker may attempt account access, session theft, password reuse, or further impersonation.', 'This is why response should include more than changing a password: active sessions, MFA settings, recovery options, and recent account activity may also need review.'] },
        ],
      },
      {
        title: 'Recognizing Phishing Emails',
        quiz: [
          { q: 'Why inspect the actual sender address?', options: ['Display names can be chosen by attackers', 'Email addresses reveal passwords', 'All safe senders use numbers', 'Addresses cannot be spoofed'], answer: 0 },
          { q: 'Which request deserves independent verification?', options: ['A routine newsletter', 'An unexpected supplier bank-account change', 'A reminder you created', 'A receipt from an official app purchase'], answer: 1 },
          { q: 'What should you inspect for a button labeled "University Portal"?', options: ['Only the button color', 'The actual destination URL', 'The email length', 'The screen resolution'], answer: 1 },
          { q: 'Which attachment name is especially suspicious?', options: ['agenda.pdf', 'photo.jpg', 'Invoice.pdf.exe', 'notes.txt'], answer: 2 },
        ],
        lessons: [
          { id: 'ph-context', title: 'Start with context', minutes: 4, status: 'todo', body: ['Ask whether the message makes sense before focusing on technical details. Was it expected? Does the sender normally make this type of request? Is the requested action normal for that role?', 'Context is not proof, but it helps prioritize what deserves verification.'] },
          { id: 'ph-sender', title: 'Display name vs. actual address', minutes: 5, status: 'todo', body: ['Email clients often show a friendly display name more prominently than the actual address. Attackers can choose familiar names.', 'Inspect the complete sender address and domain for unrelated domains, added words, character substitutions, or unusual patterns.'] },
          { id: 'ph-language', title: 'Message language and requested action', minutes: 5, status: 'todo', body: ['Urgency and fear are common signals, but sophisticated phishing can use calm and professional language. Focus on the behavior being requested.', 'Password entry, MFA approval, payment changes, confidential data, gift cards, or bypassing normal procedures all deserve additional verification.'] },
          { id: 'ph-links-attachments', title: 'Links and attachments', minutes: 5, status: 'todo', body: ['Do not rely on button text. Inspect the actual destination without visiting it when possible.', 'Unexpected attachments, double extensions, executable formats, or files that ask you to enable active content should be treated carefully and verified through another channel.'] },
        ],
      },
      {
        title: 'URLs, Domains, and Fake Websites',
        quiz: [
          { q: 'Which URL component tells the browser which host to contact?', options: ['Fragment', 'Host', 'Page title', 'Button text'], answer: 1 },
          { q: 'What is typosquatting?', options: ['Using a domain that resembles a trusted domain', 'Encrypting a website', 'Scanning a QR code', 'Blocking DNS'], answer: 0 },
          { q: 'Why are shortened URLs harder to evaluate?', options: ['They are always malicious', 'They hide the visible final destination', 'They cannot use TLS', 'They delete history'], answer: 1 },
          { q: 'What does HTTPS primarily provide?', options: ['Proof of business identity', 'Encrypted transport to the domain reached', 'Guarantee of safe content', 'Proof a page is not phishing'], answer: 1 },
        ],
        lessons: [
          { id: 'ph-url-anatomy', title: 'URL anatomy', minutes: 4, status: 'todo', body: ['A URL contains a scheme, host, path, and sometimes query parameters. For phishing analysis, the host and registrable domain are especially important because visual text elsewhere in the URL can be misleading.'] },
          { id: 'ph-domains', title: 'Domains and subdomains', minutes: 4, status: 'todo', body: ['Read domains from right to left when identifying who controls the destination. In login.school.example-attacker.net, the controlled registrable domain is example-attacker.net — the word "school" is only part of a subdomain.'] },
          { id: 'ph-lookalikes', title: 'Lookalikes, typosquatting, and shorteners', minutes: 4, status: 'todo', body: ['Attackers may register domains that resemble trusted names by adding words, swapping characters, or using similar-looking letters.', 'URL shorteners can hide the visible final destination, so unexpected shortened links require extra verification.'] },
          { id: 'ph-https', title: 'HTTPS is not a legitimacy badge', minutes: 4, status: 'todo', body: ['HTTPS encrypts the connection between the browser and the site reached. It does not prove that the site represents the organization shown on the page.', 'A phishing site can also obtain a valid TLS certificate.'] },
        ],
      },
      {
        title: 'Social Engineering Techniques',
        quiz: [
          { q: 'Why is urgency risky?', options: ['It can reduce time for careful verification', 'It changes DNS', 'It increases password length', 'It disables attachments'], answer: 0 },
          { q: 'How can a compromised account increase credibility?', options: ['It can send messages from a genuinely known account', 'It makes every link safe', 'It disables MFA', 'It prevents logging'], answer: 0 },
          { q: 'What should high-impact requests follow?', options: ['Normal approved procedures', 'The fastest reply', 'The sender\'s preferred shortcut', 'Any link in the message'], answer: 0 },
          { q: 'What is the best response to strong emotional pressure?', options: ['Act immediately', 'Pause and verify using evidence and an independent channel', 'Forward credentials', 'Disable security warnings'], answer: 1 },
        ],
        lessons: [
          { id: 'ph-authority-urgency', title: 'Authority and urgency', minutes: 4, status: 'todo', body: ['Authority makes a request feel important because it appears to come from a manager, bank, school, government office, or technical administrator. Urgency reduces time for verification.', 'Together, they are common tools for pressuring users into immediate action.'] },
          { id: 'ph-fear-curiosity', title: 'Fear, curiosity, and reward', minutes: 4, status: 'todo', body: ['Threats of account closure, disciplinary action, or financial loss can trigger fear. Unexpected documents, photos, or security notices can trigger curiosity. Rewards and prizes can trigger excitement.', 'The defensive response is the same: slow down and verify the request through a trusted path.'] },
          { id: 'ph-familiarity', title: 'Familiarity and compromised accounts', minutes: 4, status: 'todo', body: ['Messages from a known account can still be malicious if the account was compromised. Familiarity is useful context but should not override unusual requests.', 'A known person asking for a password, MFA code, gift card, or secret payment still needs verification.'] },
          { id: 'ph-deliberate-verification', title: 'Deliberate verification', minutes: 4, status: 'todo', body: ['A deliberate process separates the message from the decision. Identify the requested action, inspect the source and evidence, assess impact, and verify through a known contact method.', 'High-impact requests should follow established procedures even when the message feels convincing.'] },
        ],
      },
      {
        title: 'Attachments, Credentials, and Technical Analysis',
        quiz: [
          { q: 'Why are double extensions dangerous?', options: ['They can disguise an executable as a familiar document', 'They always encrypt files', 'They prevent antivirus from running', 'They delete hashes'], answer: 0 },
          { q: 'What is a file hash?', options: ['A fixed-length value derived from file contents', 'A plaintext password', 'A DNS record', 'A screen resolution'], answer: 0 },
          { q: 'What does a credential-harvesting page do?', options: ['Records credentials entered by the victim', 'Improves password strength', 'Encrypts disks', 'Blocks phishing'], answer: 0 },
          { q: 'What is MFA fatigue?', options: ['Repeated prompts intended to pressure approval', 'A low battery', 'A slow password manager', 'An expired certificate'], answer: 0 },
        ],
        lessons: [
          { id: 'ph-attachment-risk', title: 'Attachment risk and file extensions', minutes: 5, status: 'todo', body: ['Attachments can carry documents, scripts, installers, shortcuts, or archives. File type and context should be evaluated together. Icons can be misleading — extensions provide stronger clues.', 'A name such as Invoice.pdf.exe is an executable even though the first visible word suggests a PDF.'] },
          { id: 'ph-macros', title: 'Macros, scripts, and archives', minutes: 4, status: 'todo', body: ['Macro-enabled documents, scripts, and password-protected archives can be legitimate, but they also deserve caution when delivered unexpectedly.', 'A request to disable security controls or enable active content is a strong warning sign.'] },
          { id: 'ph-credentials', title: 'Credential harvesting and password reuse', minutes: 5, status: 'todo', body: ['Credential-harvesting pages imitate legitimate login forms and record information entered by victims. When a password is reused, one stolen credential pair can affect multiple services.', 'Credential stuffing refers to testing stolen username and password combinations against other services. Unique passwords reduce the blast radius of a single compromise.'] },
          { id: 'ph-mfa', title: 'MFA code theft, fatigue, and phishing-resistant auth', minutes: 5, status: 'todo', body: ['Attackers may ask for one-time codes, send repeated push prompts, or impersonate support staff. Unexpected MFA prompts should be denied and investigated.', 'FIDO2/WebAuthn methods bind authentication to the legitimate site and are designed to resist common credential-phishing techniques.'] },
        ],
      },
      {
        title: 'Reporting, Response, and Defense',
        quiz: [
          { q: 'What should you do with a suspicious message?', options: ['Interact more to test it', 'Report it using the approved method', 'Forward it to everyone', 'Disable security tools'], answer: 1 },
          { q: 'After entering credentials on a phishing page, what should also be reviewed?', options: ['Active sessions and account settings', 'Wallpaper', 'Speaker volume', 'Printer queue'], answer: 0 },
          { q: 'What is layered defense?', options: ['Using multiple complementary controls', 'Using only a spam filter', 'Training users once', 'Blocking every external email'], answer: 0 },
          { q: 'What is the role of DePhish explainability?', options: ['Help users understand why a result was produced', 'Replace all security teams', 'Guarantee attribution', 'Make every scan malicious'], answer: 0 },
        ],
        lessons: [
          { id: 'ph-reporting', title: 'Reporting without further interaction', minutes: 4, status: 'todo', body: ['If a message appears suspicious, avoid clicking, replying, or opening attachments simply to confirm the suspicion.', 'Use the organization\'s approved reporting mechanism so the security team or DePhish reporting workflow can review it safely.'] },
          { id: 'ph-after-click', title: 'After clicking a link or entering credentials', minutes: 5, status: 'todo', body: ['If you clicked but did not enter information, close the page and report. If you entered credentials: change the affected password, review active sessions, revoke suspicious sessions, verify MFA and recovery settings, and report.', 'If the password was reused, update other affected accounts with unique passwords.'] },
          { id: 'ph-layered-defense', title: 'Layered defense and final analysis', minutes: 5, status: 'todo', body: ['Effective phishing defense combines user awareness, email filtering, domain protections, MFA, safe browser behavior, endpoint security, reporting workflows, and incident response. No single control stops every phishing attempt.', 'For any suspicious scenario: identify the requested action, inspect identity and context, inspect links or attachments, consider technical evidence, assign a reasoned risk level, and recommend a safe response.'] },
        ],
      },
    ],
  },

  // ─── SMISHING ─────────────────────────────────────────────────────────────
  {
    id: 'smishing',
    icon: 'sms',
    tone: 'amber',
    title: 'Smishing',
    tagline: 'How fraudsters use SMS and messaging apps to deliver the same tricks in a much shorter format.',
    provider: 'DePhish Academy',
    level: 'Beginner',
    duration: '45 minutes',
    sections: [
      {
        title: 'Understand the Threat',
        quiz: [
          { q: 'What is smishing?', options: ['Phishing through SMS or text messaging', 'A firewall attack', 'Disk encryption', 'A browser update'], answer: 0 },
          { q: 'Why can mobile screens increase risk?', options: ['They may hide full sender and URL details', 'They make all links safe', 'They disable MFA', 'They prevent screenshots'], answer: 0 },
          { q: 'Which is a common smishing goal?', options: ['Credential theft', 'Improving signal strength', 'Updating screen brightness', 'Charging the battery'], answer: 0 },
          { q: 'What is safer than tapping an unexpected bank link?', options: ['Open the official app independently', 'Tap it quickly', 'Reply with your password', 'Forward it to friends'], answer: 0 },
        ],
        lessons: [
          { id: 'sm-what-is-smishing', title: 'What is smishing?', minutes: 4, status: 'done', body: ['Smishing is phishing delivered through SMS or similar text-based messaging. The attacker tries to make the recipient tap a link, call a number, reply with information, install an application, or approve a transaction.'] },
          { id: 'sm-why-targeted', title: 'Why mobile users are targeted', minutes: 4, status: 'done', body: ['Mobile screens show less information at once, users often read messages while distracted, and tapping is fast. Sender details and full URLs may be hidden or truncated, which can reduce the time available for careful verification.'] },
          { id: 'sm-attacker-goals', title: 'Common attacker goals', minutes: 4, status: 'done', body: ['Smishing can target account credentials, banking details, personal information, payment, malware installation, or a move to another channel such as a phone call or messaging app.'] },
          { id: 'sm-first-check', title: 'First-check method', minutes: 4, status: 'current', body: ['Before tapping, identify the sender claim, requested action, urgency, and verification path.', 'Open the official app or known website independently instead of using an unexpected message link.'] },
        ],
      },
      {
        title: 'Common Smishing Attacks',
        quiz: [
          { q: 'Why are delivery lures effective?', options: ['Many people expect parcels and small fees seem plausible', 'Couriers never use SMS', 'They cannot contain links', 'They always use correct grammar'], answer: 0 },
          { q: 'How should you verify a banking alert?', options: ['Use the official app or known number', 'Use the message link', 'Reply with your PIN', 'Send an MFA code'], answer: 0 },
          { q: 'What makes an unexpected job offer suspicious?', options: ['Requests for fees or sensitive data before normal verification', 'A company logo', 'A polite greeting', 'A long message'], answer: 0 },
          { q: 'Does accurate personal information prove a text is legitimate?', options: ['Yes', 'No', 'Only for schools', 'Only if the number is local'], answer: 1 },
        ],
        lessons: [
          { id: 'sm-delivery-lures', title: 'Delivery and parcel lures', minutes: 4, status: 'todo', body: ['Fake courier messages may claim that a parcel is delayed, an address is incomplete, or a small fee is required. These themes work because many people are expecting deliveries and the requested payment seems small.'] },
          { id: 'sm-banking-alerts', title: 'Banking and payment alerts', minutes: 4, status: 'todo', body: ['Messages may claim a suspicious transaction, frozen account, refund, or failed payment. The warning can create fear and urgency.', 'Verify using the official banking app or a known phone number rather than the message link.'] },
          { id: 'sm-impersonation', title: 'Government, school, and employer impersonation', minutes: 4, status: 'todo', body: ['Attackers may imitate tax agencies, schools, HR teams, or government services. Accurate names or public information can increase credibility, but sensitive requests should still follow official channels.'] },
          { id: 'sm-prize-lures', title: 'Prize, job, and account lures', minutes: 4, status: 'todo', body: ['Unexpected rewards, remote job offers, or account-expiration notices can encourage rapid action.', 'Be cautious when the message asks for upfront fees, personal details, credentials, or installation of an app.'] },
        ],
      },
      {
        title: 'Recognizing Suspicious Messages',
        quiz: [
          { q: 'Is a local-looking phone number proof of legitimacy?', options: ['Yes', 'No', 'Only during business hours', 'Only if it starts with +63'], answer: 1 },
          { q: 'What should you focus on more than grammar?', options: ['The requested action and context', 'Emoji count', 'Message length', 'Phone wallpaper'], answer: 0 },
          { q: 'Which request is especially sensitive?', options: ['An OTP or PIN', 'A store opening time', 'A public event date', 'A weather update'], answer: 0 },
          { q: 'What is independent verification?', options: ['Using a trusted channel you already know', 'Calling only the number in the message', 'Opening the message link', 'Replying with account details'], answer: 0 },
        ],
        lessons: [
          { id: 'sm-sender-numbers', title: 'Sender numbers and names', minutes: 4, status: 'todo', body: ['A familiar sender name or local-looking number is not proof of legitimacy. Some messaging systems support alphanumeric sender IDs, and phone numbers can be spoofed or obtained from compromised accounts.'] },
          { id: 'sm-language-pressure', title: 'Language and pressure', minutes: 4, status: 'todo', body: ['Look for requests that create urgency, secrecy, fear, or reward. Grammar quality is not a reliable security control.', 'Focus on whether the requested action is expected and appropriate.'] },
          { id: 'sm-unexpected-requests', title: 'Unexpected requests for information', minutes: 4, status: 'todo', body: ['Legitimate organizations usually have established processes for passwords, OTPs, PINs, identity documents, and payment changes. A text requesting these directly should be treated with caution.'] },
          { id: 'sm-independent-verification', title: 'Context and independent verification', minutes: 4, status: 'todo', body: ['Context helps but is not enough. If a message is about a real delivery or real account, verify using a channel you already trust.', 'Do not use contact details contained only in the suspicious message.'] },
        ],
      },
      {
        title: 'Malicious Links and QR Codes',
        quiz: [
          { q: 'Why can mobile URLs be harder to evaluate?', options: ['Apps may hide or truncate details', 'Mobile links cannot be malicious', 'HTTPS is automatic proof', 'Phone numbers verify domains'], answer: 0 },
          { q: 'What is safest for a sensitive account action?', options: ['Open the official app independently', 'Use any shortened link', 'Ignore the domain', 'Disable browser warnings'], answer: 0 },
          { q: 'What is quishing?', options: ['Phishing using QR codes', 'A Wi-Fi encryption standard', 'A file hash', 'A firewall policy'], answer: 0 },
          { q: 'Does HTTPS prove a mobile page is the real bank?', options: ['Yes', 'No', 'Only on Android', 'Only on Wi-Fi'], answer: 1 },
        ],
        lessons: [
          { id: 'sm-hidden-urls', title: 'Hidden or truncated URLs', minutes: 4, status: 'todo', body: ['Mobile apps may shorten how URLs are displayed. A link that appears to contain a familiar brand name can still lead to an unrelated domain.', 'Inspect the destination when the device allows it, or avoid the link and navigate independently.'] },
          { id: 'sm-fake-login', title: 'Fake mobile login pages and redirects', minutes: 4, status: 'todo', body: ['A fake mobile page can imitate a bank, courier, email provider, or social network. Small screens make visual comparison harder, so the domain and how the page was reached are more important than appearance.', 'Shortened links and redirect services hide the final destination. The safest option for sensitive actions is often the official app or a known bookmark.'] },
          { id: 'sm-quishing', title: 'QR code phishing (quishing)', minutes: 5, status: 'todo', body: ['QR phishing — sometimes called quishing — uses a QR code to move the target to a malicious destination. A QR code hides the destination until it is scanned, and attackers can place a sticker over a legitimate code.', 'Use a scanner that previews the destination when possible. For sensitive tasks, prefer the official app or manually navigate to the known service.'] },
          { id: 'sm-https-mobile', title: 'HTTPS on mobile', minutes: 3, status: 'todo', body: ['A padlock means the connection to the current domain is encrypted. It does not prove the site is trustworthy.', 'Always identify the actual domain before entering credentials or payment information.'] },
        ],
      },
      {
        title: 'Mobile Malware and Fake Apps',
        quiz: [
          { q: 'What is suspicious about an unsolicited APK link?', options: ['It asks you to install software outside normal trusted channels', 'APK files are always safe', 'It verifies the courier', 'It prevents phishing'], answer: 0 },
          { q: 'Why review app permissions?', options: ['Permissions can expose sensitive data or capabilities', 'Permissions change screen color', 'They guarantee app identity', 'They replace MFA'], answer: 0 },
          { q: 'What is sideloading?', options: ['Installing an app outside the normal app-store workflow', 'Sending an SMS', 'Scanning a QR code', 'Resetting a password'], answer: 0 },
          { q: 'After installing a suspicious app, where should critical password changes be made?', options: ['Preferably from a clean trusted device', 'Inside the suspicious app', 'Using the same message link', 'By sending the password via SMS'], answer: 0 },
        ],
        lessons: [
          { id: 'sm-app-lures', title: 'App-installation lures', minutes: 4, status: 'todo', body: ['A smishing message may direct users to install an app outside the normal store or to install a fake update.', 'Unsolicited installation requests deserve caution, especially when they require changing security settings.'] },
          { id: 'sm-permissions', title: 'Permissions and accessibility abuse', minutes: 4, status: 'todo', body: ['Permissions such as SMS access, notification access, accessibility services, contacts, or screen capture can expose sensitive information when granted to malicious apps.', 'Permissions should match the app\'s stated purpose.'] },
          { id: 'sm-sideloading', title: 'APK and sideloading risk', minutes: 4, status: 'todo', body: ['Android package files can be legitimate, but sideloading bypasses some normal store review and update workflows.', 'Install applications only from trusted sources required by your organization or device policy.'] },
          { id: 'sm-suspicious-install', title: 'Response to suspicious installation', minutes: 4, status: 'todo', body: ['If a suspicious app was installed: disconnect from sensitive activity, remove the app if safe to do so, review permissions, scan the device using trusted security tools, change affected credentials from a clean device, and report the incident.'] },
        ],
      },
      {
        title: 'Detection, Response, and Reporting',
        quiz: [
          { q: 'What should you avoid with a suspicious text?', options: ['Replying to test it', 'Reporting it', 'Opening the official app independently', 'Blocking the sender'], answer: 0 },
          { q: 'Does blocking replace reporting after account compromise?', options: ['Yes', 'No', 'Only for delivery scams', 'Only on iPhone'], answer: 1 },
          { q: 'After sharing payment details, what is important?', options: ['Contact the provider through a trusted channel quickly', 'Keep chatting with the sender', 'Post the details publicly', 'Disable device security'], answer: 0 },
          { q: 'What should a final smishing analysis include?', options: ['Evidence, risk, uncertainty, and response', 'Only the sender number', 'Only spelling mistakes', 'Only the phone model'], answer: 0 },
        ],
        lessons: [
          { id: 'sm-detection', title: 'Smishing detection and risk scoring', minutes: 5, status: 'todo', body: ['Useful indicators include sender number or ID, message text, URLs, domains, phone numbers, QR destinations, app-installation requests, and context. DePhish can present these as explainable findings.', 'A risk score can combine high-impact requests, suspicious domains, shortened URLs, urgency, and credential requests. Phone-number reputation is useful context, not absolute proof.'] },
          { id: 'sm-do-not-continue', title: 'Do not continue the conversation', minutes: 4, status: 'todo', body: ['When a text is suspicious, avoid replying, tapping, calling the included number, or sending information merely to test it.', 'Use a trusted route to verify the organization.'] },
          { id: 'sm-block-report', title: 'Block, report, and recover', minutes: 5, status: 'todo', body: ['Use the device or carrier reporting features where appropriate and submit the message to the organization\'s security or DePhish reporting workflow.', 'If credentials, payment details, or OTPs were shared: contact the affected service through a trusted channel, secure the account, review transactions or sessions, and report.'] },
        ],
      },
    ],
  },

  // ─── VISHING ──────────────────────────────────────────────────────────────
  {
    id: 'vishing',
    icon: 'phone',
    tone: 'red',
    title: 'Vishing',
    tagline: 'How scam calls build trust over the phone to extract passwords, codes, and payments.',
    provider: 'DePhish Academy',
    level: 'Intermediate',
    duration: '45 minutes',
    sections: [
      {
        title: 'Understand the Threat',
        quiz: [
          { q: 'What is vishing?', options: ['Voice-based phishing', 'A disk attack', 'A firewall protocol', 'A file extension'], answer: 0 },
          { q: 'Why can voice be persuasive?', options: ['The caller can adapt and pressure in real time', 'Phone calls prove identity', 'Caller ID cannot be spoofed', 'Voice prevents social engineering'], answer: 0 },
          { q: 'Which is a common vishing goal?', options: ['OTP theft', 'Improving call quality', 'Changing wallpaper', 'Updating a printer'], answer: 0 },
          { q: 'What is the core defense for sensitive requests?', options: ['End the call and verify through a trusted independent number', 'Stay on the call until convinced', 'Read out the OTP', 'Install remote access software'], answer: 0 },
        ],
        lessons: [
          { id: 'vs-what-is-vishing', title: 'What is vishing?', minutes: 4, status: 'done', body: ['Vishing is phishing conducted through voice calls or voice messages. Attackers may impersonate banks, technical support, employers, government offices, delivery companies, or people the victim knows.'] },
          { id: 'vs-why-persuasive', title: 'Why voice can be persuasive', minutes: 4, status: 'done', body: ['Conversation creates immediacy. A caller can react to questions, apply pressure, sound professional, and adapt the story in real time.', 'People may also assume that a caller who knows personal information must be legitimate — but personal details can be public, leaked, or obtained from earlier attacks.'] },
          { id: 'vs-common-goals', title: 'Common goals and core defense', minutes: 4, status: 'current', body: ['Vishing can target passwords, OTPs, card information, money transfers, remote-access installation, account recovery data, or information that supports later attacks.', 'Core defense: do not treat caller ID, confidence, or personal knowledge as proof. For sensitive requests, end the call and contact the organization using a trusted number you obtained independently.'] },
        ],
      },
      {
        title: 'Common Vishing Scenarios',
        quiz: [
          { q: 'What is suspicious in a technical-support call?', options: ['An unsolicited request for remote access', 'A scheduled support callback you requested', 'A ticket number from your own portal', 'A known internal help desk extension'], answer: 0 },
          { q: 'How should a bank fraud call be verified?', options: ['Through the official bank number or app', 'By reading an OTP to the caller', 'By trusting caller ID', 'By installing their software'], answer: 0 },
          { q: 'Why are authority scams effective?', options: ['They can create fear and pressure', 'Government numbers cannot be spoofed', 'They disable MFA', 'They encrypt calls'], answer: 0 },
          { q: 'What should you do with an urgent family payment request?', options: ['Verify the person through another trusted channel', 'Transfer immediately', 'Keep it secret', 'Share your bank PIN'], answer: 0 },
        ],
        lessons: [
          { id: 'vs-bank-impersonation', title: 'Bank and fraud department impersonation', minutes: 4, status: 'todo', body: ['A caller may claim that suspicious transactions were detected and ask the victim to verify card details, transfer funds, or provide an OTP.', 'Genuine fraud teams may contact customers, so verification through an official number is important — not the number the caller provides.'] },
          { id: 'vs-tech-support', title: 'Technical support scams', minutes: 4, status: 'todo', body: ['The caller may claim that malware, account problems, or device errors require remote access or software installation.', 'Unsolicited support calls asking for remote control should be treated as high risk.'] },
          { id: 'vs-government-impersonation', title: 'Government and authority impersonation', minutes: 4, status: 'todo', body: ['Scammers may claim unpaid taxes, fines, legal trouble, or account suspension. Fear and authority can pressure people into payment or information disclosure.', 'Official agencies generally use established procedures that can be independently verified.'] },
          { id: 'vs-family-employer', title: 'Family, employer, and delivery impersonation', minutes: 4, status: 'todo', body: ['Attackers may impersonate relatives, supervisors, HR staff, or couriers.', 'A request that bypasses normal procedures, demands secrecy, or asks for urgent payment deserves independent confirmation.'] },
        ],
      },
      {
        title: 'Social Engineering Through Voice',
        quiz: [
          { q: 'Is a confident professional voice proof of identity?', options: ['Yes', 'No', 'Only for banks', 'Only for employers'], answer: 1 },
          { q: 'What does urgency often do?', options: ['Reduces time for verification', 'Improves authentication', 'Changes caller ID', 'Encrypts the call'], answer: 0 },
          { q: 'What is a useful resistance technique?', options: ['End the call and verify independently', 'Argue for ten minutes', 'Read the OTP slowly', 'Install remote software'], answer: 0 },
          { q: 'How should a legitimate organization react to reasonable verification?', options: ['It should generally allow it', 'It should threaten you', 'It should demand secrecy', 'It should require your password'], answer: 0 },
        ],
        lessons: [
          { id: 'vs-authority-confidence', title: 'Authority and confidence', minutes: 4, status: 'todo', body: ['A confident tone, professional vocabulary, or knowledge of internal terms can make a caller sound legitimate.', 'These are presentation signals, not identity proof.'] },
          { id: 'vs-fear-urgency', title: 'Fear and urgency', minutes: 4, status: 'todo', body: ['Threats of fraud, arrest, service suspension, job consequences, or financial loss can reduce critical thinking.', 'A safe process gives you permission to end the call and verify before acting.'] },
          { id: 'vs-rapport', title: 'Rapport, familiarity, and resistance techniques', minutes: 5, status: 'todo', body: ['Some callers build rapport instead of using fear. They may reference shared contacts, events, or personal details. Familiarity can lower suspicion, so unusual high-impact requests still need verification.', 'Use short, repeatable responses: do not disclose secrets, do not approve unexpected MFA, do not install software, and do not let the caller prevent independent verification.'] },
        ],
      },
      {
        title: 'Caller Identity and Credential Theft',
        quiz: [
          { q: 'Is caller ID strong authentication?', options: ['Yes', 'No', 'Only for local calls', 'Only when the name matches'], answer: 1 },
          { q: 'Can an official-looking number be spoofed?', options: ['Yes', 'No', 'Only on landlines', 'Only internationally'], answer: 0 },
          { q: 'Should legitimate support need your full password?', options: ['Generally no', 'Always yes', 'Only by phone', 'Only after midnight'], answer: 0 },
          { q: 'What does an OTP authenticate?', options: ['The account action or session, not the caller identity', 'The caller\'s voice', 'Caller ID', 'The phone brand'], answer: 0 },
        ],
        lessons: [
          { id: 'vs-caller-id', title: 'Caller ID is metadata', minutes: 4, status: 'todo', body: ['Caller ID displays information associated with a call, but it should not be treated as strong authentication. Attackers can manipulate or spoof displayed numbers, and compromised accounts can also be used.', 'A call may appear to come from a local number, a bank, or a government office — number familiarity does not prove who is speaking.'] },
          { id: 'vs-voip', title: 'VoIP, virtual numbers, and callback verification', minutes: 4, status: 'todo', body: ['Voice-over-IP and virtual phone services are legitimate technologies, but they also mean a phone number may not reveal a caller\'s physical location or organizational identity.', 'For sensitive requests, end the call and use a trusted number from an official app, card, website, or known contact — never a callback number provided only by the suspicious caller.'] },
          { id: 'vs-credential-theft', title: 'Passwords, OTPs, and payment theft', minutes: 5, status: 'todo', body: ['Legitimate support should not require users to reveal full passwords. Attackers may trigger a real login attempt and then call asking for the resulting code or approval — the code can be valid even though the caller is malicious.', 'High-impact financial actions require independent verification. Callers may request card details, account numbers, transfers, gift cards, or cryptocurrency.'] },
          { id: 'vs-account-recovery', title: 'Account recovery abuse', minutes: 4, status: 'todo', body: ['Information such as date of birth, address, security answers, and recovery details can help attackers take over accounts.', 'Avoid giving unnecessary personal information simply because a caller already knows some details.'] },
        ],
      },
      {
        title: 'AI Impersonation and Detection',
        quiz: [
          { q: 'Is a familiar voice proof of identity?', options: ['Yes', 'No', 'Only for family', 'Only on video calls'], answer: 1 },
          { q: 'What is voice cloning?', options: ['Synthetic speech made to imitate a voice', 'Caller-ID encryption', 'A password manager', 'A firewall rule'], answer: 0 },
          { q: 'Which is a strong vishing warning sign?', options: ['Refusal to allow independent verification', 'A normal scheduled callback', 'A known internal process', 'A public office address'], answer: 0 },
          { q: 'Should a secret family phrase be the only verification control?', options: ['No', 'Yes', 'Only for banks', 'Only for school calls'], answer: 0 },
        ],
        lessons: [
          { id: 'vs-voice-cloning', title: 'Voice cloning and deepfake calls', minutes: 5, status: 'todo', body: ['Modern tools can generate or imitate speech from limited audio samples. A familiar voice is therefore not reliable proof of identity for a high-impact request.', 'Synthetic or manipulated audio may be used to imitate executives, relatives, or public-facing staff. The attack still depends on social engineering — the target is pressured to act before independently verifying.'] },
          { id: 'vs-verification-beyond-voice', title: 'Verification beyond voice', minutes: 4, status: 'todo', body: ['Use another factor the caller cannot easily reproduce: call a known number, confirm through a separate messaging channel, follow a business approval workflow, or use a pre-agreed family verification method.', 'A family phrase can help, but it should not be the only control because phrases can be exposed. Stronger verification combines independent contact paths and normal financial procedures.'] },
          { id: 'vs-behavioral-indicators', title: 'Detecting vishing attempts', minutes: 5, status: 'todo', body: ['Warning signs include refusal to allow verification, requests for secrets, unusual urgency, demands for secrecy, bypassing normal procedures, or requests to install software or move money.', 'Document useful facts: time, displayed number, claimed organization, requested action, and what information was shared.'] },
        ],
      },
      {
        title: 'Responding and Reporting',
        quiz: [
          { q: 'Why end a suspicious call?', options: ['It breaks pressure and allows independent verification', 'It proves the caller is malicious', 'It deletes the phone number', 'It resets your password'], answer: 0 },
          { q: 'After sharing an OTP, what should you do?', options: ['Secure the affected account and report it', 'Keep talking', 'Share another OTP', 'Ignore account activity'], answer: 0 },
          { q: 'Can a phone number alone prove attacker identity?', options: ['Yes', 'No', 'Only if local', 'Only if it has a name'], answer: 1 },
          { q: 'What should a final vishing report avoid?', options: ['Unsupported claims about attacker identity', 'Observable facts', 'Requested action', 'Recommended response'], answer: 0 },
        ],
        lessons: [
          { id: 'vs-end-calls', title: 'End suspicious calls', minutes: 4, status: 'todo', body: ['You are not required to stay on a suspicious call. Ending the call breaks the attacker\'s pressure cycle and gives you time to verify independently.'] },
          { id: 'vs-secure-accounts', title: 'Secure affected accounts and report', minutes: 5, status: 'todo', body: ['If secrets, OTPs, or account details were disclosed: secure the account through the legitimate provider, review sessions and recent activity, and report. Financial institutions may need rapid notification for unauthorized transfers.', 'Report the phone number, claimed organization, time, requested action, and other relevant details through the approved channel.'] },
          { id: 'vs-respond-to-calls', title: 'How to handle a suspicious call', minutes: 6, status: 'todo', body: ['If a call asks for a password, a one-time code, or an urgent payment, treat it as suspicious even if the caller ID looks official.', 'Hang up and call the organization back on a number you already trust.'] },
        ],
      },
    ],
  },
];
