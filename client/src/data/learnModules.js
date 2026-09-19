// Learn module content.
//
// This file is the single place to edit course content. Everything on the
// Learn page is rendered from this array, so teammates can replace the
// placeholder lesson text here without touching any components.
//
// Fields:
//   id        stable key also used for the card thumbnail tone
//   icon      icon key mapped in Learn.jsx (fish | sms | phone)
//   tone      thumbnail/badge color class (blue | amber | red)
//   title     module name
//   tagline   short description shown on cards and the overview page
//   provider  label shown above "Course | Self-paced"
//   level     badge label, e.g. Beginner
//   duration  shown in the info strip and card footer
//   sections  course outline: each section has lessons
//     lesson status: 'done' (checkmark) | 'current' (progress bar) | 'todo'
//     lesson body: array of paragraphs (placeholder text for now)

export const learnModules = [
  {
    id: 'phishing',
    icon: 'fish',
    tone: 'blue',
    title: 'Phishing',
    tagline: 'How fake emails try to trick you into clicking a malicious link or handing over your password.',
    provider: 'DePhish Academy',
    level: 'Beginner',
    duration: '30 minutes',
    sections: [
      {
        title: 'Understand the threat',
        lessons: [
          {
            id: 'what-is-phishing',
            title: 'What is phishing?',
            minutes: 4,
            status: 'done',
            body: [
              '[Placeholder lesson text] Phishing is a social engineering attack where a message pretends to come from a trusted source in order to steal credentials, money, or personal information.',
              'Attacks usually rely on urgency, authority, and curiosity to get you to act before you think. The goal is never the message itself: it is the click, the reply, or the login that follows.',
            ],
          },
          {
            id: 'anatomy-of-a-phish',
            title: 'The anatomy of a phishing email',
            minutes: 6,
            status: 'done',
            body: [
              '[Placeholder lesson text] A phishing email usually has a few telltale building blocks: a spoofed sender, a hook that creates urgency, one or more links, and a call to action.',
              'This lesson breaks each part down so you can scan the structure of a message quickly instead of reading every word.',
            ],
          },
        ],
      },
      {
        title: 'Practice spotting it',
        lessons: [
          {
            id: 'red-flags',
            title: 'Red flags to look for',
            minutes: 5,
            status: 'current',
            body: [
              '[Placeholder lesson text] Common red flags include mismatched sender addresses, poor grammar, threats or deadlines, and links that do not match the visible text.',
              'Remember that no single clue proves an email is fake. Weigh the clues together and, when in doubt, verify through an official channel.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'smishing',
    icon: 'sms',
    tone: 'amber',
    title: 'Smishing',
    tagline: 'How fraudsters use SMS and messaging apps to deliver the same tricks in a much shorter format.',
    provider: 'DePhish Academy',
    level: 'Beginner',
    duration: '20 minutes',
    sections: [
      {
        title: 'Understand the threat',
        lessons: [
          {
            id: 'what-is-smishing',
            title: 'What is smishing?',
            minutes: 4,
            status: 'done',
            body: [
              '[Placeholder lesson text] Smishing is phishing delivered by text message. Because texts are short and personal, they can feel more immediate and harder to question than email.',
              'Attackers impersonate delivery companies, banks, or government agencies and push you toward a link, a phone number, or a code.',
            ],
          },
          {
            id: 'sms-red-flags',
            title: 'Red flags in a short text',
            minutes: 5,
            status: 'current',
            body: [
              '[Placeholder lesson text] Watch for unsolicited texts with links, unexpected tracking messages, requests for verification codes, and pressure to reply immediately.',
              'Legitimate organizations rarely ask you to confirm account details by replying to an unsolicited text.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'vishing',
    icon: 'phone',
    tone: 'red',
    title: 'Vishing',
    tagline: 'How scam calls build trust over the phone to extract passwords, codes, and payments.',
    provider: 'DePhish Academy',
    level: 'Intermediate',
    duration: '25 minutes',
    sections: [
      {
        title: 'Understand the threat',
        lessons: [
          {
            id: 'what-is-vishing',
            title: 'What is vishing?',
            minutes: 4,
            status: 'done',
            body: [
              '[Placeholder lesson text] Vishing is phishing by voice call. Scammers use caller ID spoofing and social scripts to sound like your bank, the police, or your internet provider.',
              'A convincing voice and familiar details can be engineered in advance from data found online.',
            ],
          },
          {
            id: 'respond-to-calls',
            title: 'How to handle a suspicious call',
            minutes: 6,
            status: 'todo',
            body: [
              '[Placeholder lesson text] If a call asks for a password, a one-time code, or an urgent payment, treat it as suspicious even if the caller IDs look official.',
              'Hang up and call the organization back on a number you already trust.',
            ],
          },
        ],
      },
    ],
  },
];