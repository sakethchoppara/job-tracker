import { Router } from 'express';
import { addStatus, getStatuses, removeStatus } from '../db.js';

const router = Router();

router.get('/', (req, res) => res.json(getStatuses(req.user.id)));
// { label, color, after }: `after` is the key of the lane it follows; omit to add at the end.
router.post('/', (req, res) => res.status(201).json(addStatus(req.user.id, req.body || {})));
// Only empty lanes can be removed (enforced in removeStatus).
router.delete('/:key', (req, res) => res.json(removeStatus(req.user.id, req.params.key)));

export default router;
