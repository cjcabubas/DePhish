import { inspectLink } from '../services/linkService.js';
export async function checkLink(req, res, next) {
  try { res.json(await inspectLink(req.body?.url)); }
  catch (error) { if (error.code === 'INVALID_URL') return res.status(400).json({ message: error.message }); next(error); }
}
