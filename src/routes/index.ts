import { Router } from 'express'
import authRoutes from './auth.routes'
import uploadRoutes from './upload.routes'
import userRoutes from './user.routes'
import categoryRoutes from './category.routes'
import productRoutes from './product.routes'
import customerRoutes from './customer.routes'
import addOnRoutes from './addOn.routes'
import transactionRoutes from './transaction.routes'
import heldOrderRoutes from './heldOrder.routes'
import promoRoutes from './promo.routes'
import reportRoutes from './report.routes'
import shiftRoutes from './shift.routes'
import paymentMethodRoutes from './paymentMethod.routes'
import printerRoutes from './printer.routes'
import queueRoutes from './queue.routes'

const router = Router()

// Mount routes
router.use('/auth', authRoutes)
router.use('/upload', uploadRoutes)
router.use('/users', userRoutes)
router.use('/categories', categoryRoutes)
router.use('/products', productRoutes)
router.use('/customers', customerRoutes)
router.use('/add-ons', addOnRoutes)
router.use('/transactions', transactionRoutes)
router.use('/held-orders', heldOrderRoutes)
router.use('/promos', promoRoutes)
router.use('/reports', reportRoutes)
router.use('/shifts', shiftRoutes)
router.use('/payment-methods', paymentMethodRoutes)
router.use('/printers', printerRoutes)
router.use('/queue', queueRoutes)

export default router
