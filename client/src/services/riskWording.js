export const indicatorWording = {
  urgency_pressure: ['Pressure to act quickly', 'A deadline or account warning pushes you to act before checking.', 'Check the warning in the official app or call a number you already trust.'],
  credential_harvesting: ['Request for account or personal details', 'A fake sign-in or account-update page could collect your password or personal information.', 'Open the official app or website yourself to check the request.'],
  financial_bait: ['Prize, refund, or money offer', 'A reward or financial offer could lead you to pay a fee or share personal details.', 'Check the offer with the organization before paying or sharing information.'],
  impersonation: ['Uses a trusted organization’s name', 'The message mentions a bank, company, or support team. A familiar name alone does not prove who sent it.', 'Confirm the request through an official app or a known contact.'],
  call_to_action: ['Asks you to click, call, or open a file', 'The message asks you to follow a link, contact someone, or open content. Check where that action takes you.', 'Confirm unexpected links or files with the sender using a contact you already know.'],
  structural_anomalies: ['Unusual formatting or contact details', 'Capital letters, repeated punctuation, or phone numbers were found. These are weak clues that also appear in ordinary messages.', 'Focus on who sent the message and what it asks you to do.'],
  secret_disclosure: ['Request for a password or verification code', 'A password, PIN, one-time password (OTP), or recovery phrase can let someone access your account or approve a payment.', 'Do not send these details to another person. Check the request in the official app.'],
  payment_redirection: ['Changed payment details or unusual payment request', 'New bank details, gift cards, or unexpected fees could send your money to the wrong person.', 'Call the recipient using a number you already trust before paying.'],
  remote_access: ['Request to control your device', 'Remote-access software such as AnyDesk can let another person view your screen and control your device.', 'Verify the support agent before installing software or allowing access.'],
  security_bypass: ['Request to turn off protection or keep a secret', 'Turning off security tools, enabling document macros, or avoiding trusted contacts can make a scam easier to carry out.', 'Keep your protection on and check the request with a trusted contact.'],
  text_obfuscation: ['Unusual characters or disguised links', 'Hidden characters or altered link formats can make it harder to read the real website address.', 'Check the website address carefully before opening it.'],
};

export const assessmentWording = {
  Legitimate: ['Few signs of phishing found', 'The scan found low risk. Check unexpected requests for money or personal details before acting.'],
  Suspicious: ['Some warning signs need checking', 'This message has signs that could be phishing. Confirm the sender and request before clicking, paying, or replying.'],
  Phishing: ['High risk of a phishing attempt', 'The scan found strong warning signs. Avoid the message’s links and verify the request through an official app or a trusted contact.'],
};
