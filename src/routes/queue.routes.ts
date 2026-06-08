import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { getQueue, advanceItemStatus } from '../controllers/queueController'

const router = Router()

router.use(authenticate)

router.get('/', requirePermission('kasir'), getQueue)
router.patch('/:id/item/:index', requirePermission('kasir'), advanceItemStatus)

export default router
