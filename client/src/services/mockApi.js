// Replace these functions with HTTP calls when the backend is available.
// Components consume only this module, keeping the UI independent of API details.
const scans = [
  { id: 'scan-1042', title: 'PayPal account notice', type: 'Email', date: 'Sep 9, 2026', score: 91, status: 'Suspicious', summary: 'Credential request, urgency, and a lookalike link detected.' },
  { id: 'scan-1041', title: 'GCash prize SMS', type: 'SMS', date: 'Sep 7, 2026', score: 78, status: 'Suspicious', summary: 'Unverified sender and shortened link detected.' },
  { id: 'scan-1040', title: 'Meeting invite from team', type: 'Email', date: 'Sep 4, 2026', score: 8, status: 'Verified', summary: 'No phishing indicators were found.' },
];
const reports = [
  { id: 'rpt-301', reporter: 'Lito Lapid', category: 'URL', value: 'paypaI-account-security.com', submitted: '12 min ago', status: 'Pending' },
  { id: 'rpt-300', reporter: 'Malupiton', category: 'Email', value: 'billing@metrobank-login.co', submitted: '38 min ago', status: 'Suspicious' },
  { id: 'rpt-299', reporter: 'Mr.Bean', category: 'Phone number', value: '+63 917 555 0182', submitted: '2 hrs ago', status: 'Verified' },
  { id: 'rpt-298', reporter: 'Lito Lapid', category: 'URL', value: 'delivery-track-ph.info', submitted: 'Yesterday', status: 'False positive' },
];
const delay = (value) => Promise.resolve(value);
export const api = {
  auth: { login: (credentials) => delay({ user: { id: 'usr-1', name: credentials.email.split('@')[0] || 'User', role: credentials.email.startsWith('admin@') ? 'admin' : 'user' }, token: 'mock-token' }), signup: (payload) => delay({ user: { id: 'usr-1', name: payload.name, role: 'user' }, token: 'mock-token' }), logout: () => delay(true) },
  scans: { list: () => delay(scans), get: (id) => delay(scans.find((scan) => scan.id === id)) },
  reports: { list: () => delay(reports), updateStatus: (id, status) => delay(reports.map((report) => report.id === id ? { ...report, status } : report).find((report) => report.id === id)) },
};
