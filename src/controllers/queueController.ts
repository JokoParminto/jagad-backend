import { Request, Response, NextFunction } from 'express'
import { pool } from '../config/database'
import { successResponse } from '../utils/response'
import { AppError } from '../middleware/errorHandler'

export type ItemStatus = 'pending' | 'making' | 'done'

export interface QueueItemSnapshot {
  name: string
  qty: number
  notes: string
  addons: string[]
  status: ItemStatus
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get current active shift id + next queue_number for that shift.
 * queue_number resets to 1 every new shift.
 */
async function getNextQueueNumber(client: any): Promise<{ shiftId: string | null; queueNumber: number }> {
  const shiftResult = await client.query(
    `SELECT id FROM shifts WHERE status = 'active' ORDER BY opened_at DESC LIMIT 1`,
  )
  if (shiftResult.rows.length === 0) {
    return { shiftId: null, queueNumber: 1 }
  }
  const shiftId = shiftResult.rows[0].id
  const countResult = await client.query(
    `SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_num FROM preparation_queue WHERE shift_id = $1`,
    [shiftId],
  )
  return { shiftId, queueNumber: countResult.rows[0].next_num }
}

/**
 * Build items snapshot from request body items.
 * All items start as 'pending' unless status is explicitly passed.
 */
export function buildItemsSnapshot(items: any[], defaultStatus: ItemStatus = 'pending'): QueueItemSnapshot[] {
  return items.map((item: any) => ({
    name: item.product_name || item.name || '',
    qty: parseInt(item.quantity) || 1,
    notes: item.notes || '',
    addons: (item.addOns || item.add_ons || [])
      .map((a: any) => {
        const name = a.addOnName || a.add_on_name || a.name || ''
        const qty = parseInt(a.quantity) || 1
        return qty > 1 ? `${name} (x${qty})` : name
      })
      .filter(Boolean),
    status: defaultStatus,
  }))
}

/**
 * Insert hold order into preparation_queue.
 */
export async function enqueueHoldOrder(
  client: any,
  refId: string,
  transactionNumber: string,
  customerName: string,
  items: any[],
  orderedAt?: Date,
): Promise<void> {
  const { shiftId, queueNumber } = await getNextQueueNumber(client)
  await client.query(
    `INSERT INTO preparation_queue
       (order_ref_id, order_type, transaction_number, customer_name, items, is_active, ordered_at, shift_id, queue_number)
     VALUES ($1, 'hold', $2, $3, $4, true, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      refId,
      transactionNumber,
      customerName || 'Tanpa Nama',
      JSON.stringify(buildItemsSnapshot(items)),
      orderedAt || new Date(),
      shiftId,
      queueNumber,
    ],
  )
}

/**
 * Insert paid (direct checkout) order into preparation_queue.
 */
export async function enqueuePaidOrder(
  client: any,
  refId: string,
  transactionNumber: string,
  customerName: string,
  items: any[],
): Promise<void> {
  const { shiftId, queueNumber } = await getNextQueueNumber(client)
  await client.query(
    `INSERT INTO preparation_queue
       (order_ref_id, order_type, transaction_number, customer_name, items, is_active, ordered_at, shift_id, queue_number)
     VALUES ($1, 'paid', $2, $3, $4, true, CURRENT_TIMESTAMP, $5, $6)`,
    [
      refId,
      transactionNumber,
      customerName || 'Tanpa Nama',
      JSON.stringify(buildItemsSnapshot(items)),
      shiftId,
      queueNumber,
    ],
  )
}

/**
 * When a hold order is paid via checkout:
 * Update existing queue entry (type: hold→paid, new ref id, preserve ordered_at + item statuses).
 */
export async function updateHoldToPaid(
  client: any,
  holdRefId: string,
  newTransactionId: string,
  newTransactionNumber: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE preparation_queue
     SET order_type = 'paid',
         order_ref_id = $1,
         transaction_number = $2
     WHERE order_ref_id = $3 AND order_type = 'hold'
     RETURNING id`,
    [newTransactionId, newTransactionNumber, holdRefId],
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * Soft delete queue entry by order_ref_id.
 * Used when hold order is cancelled (deleteHeldOrder).
 * Cronjob will clean up soft-deleted records later.
 */
export async function dequeueByRefId(refId: string): Promise<void> {
  await pool.query(
    `UPDATE preparation_queue SET is_active = false WHERE order_ref_id = $1`,
    [refId],
  )
}

/**
 * Sync queue entry when hold order is updated with new/removed items.
 * - Existing items: keep their current status
 * - New items (not previously in queue): add as 'pending'
 * - Removed items (in queue but not in updated order): drop them
 * - If no pending/making items remain: soft delete
 * - If queue entry doesn't exist at all: create fresh
 */
export async function syncHoldOrderQueue(
  client: any,
  transactionId: string,
  transactionNumber: string,
  customerName: string,
  updatedItems: any[],
): Promise<void> {
  const existing = await client.query(
    `SELECT id, items FROM preparation_queue WHERE order_ref_id = $1 LIMIT 1`,
    [transactionId],
  )

  const newSnapshot = buildItemsSnapshot(updatedItems)

  if (existing.rows.length === 0) {
    // No entry at all → create fresh
    await enqueueHoldOrder(client, transactionId, transactionNumber, customerName, updatedItems)
    return
  }

  const queueId = existing.rows[0].id
  const existingItems: QueueItemSnapshot[] = existing.rows[0].items || []

  // Merge: match by name, track used indices to avoid double-matching duplicate lines.
  // Reset to pending if qty increased (more units ordered than previously tracked).
  const usedIndices = new Set<number>()

  const merged: QueueItemSnapshot[] = newSnapshot.map(newItem => {
    const foundIdx = existingItems.findIndex(
      (ei, idx) => ei.name === newItem.name && !usedIndices.has(idx),
    )

    if (foundIdx === -1) {
      // No match → brand new item
      return { ...newItem, status: 'pending' }
    }

    const found = existingItems[foundIdx]
    usedIndices.add(foundIdx)

    // Qty increased → extra units need to be made → reset to pending
    if (newItem.qty > found.qty) {
      return { ...newItem, status: 'pending' }
    }

    // Same or fewer qty → keep existing status
    return { ...newItem, status: found.status }
  })

  // Check if any item still needs action
  const hasActive = merged.some(i => i.status !== 'done')

  await client.query(
    `UPDATE preparation_queue
     SET items = $1,
         is_active = $2,
         customer_name = $3,
         transaction_number = $4
     WHERE id = $5`,
    [JSON.stringify(merged), hasActive, customerName || 'Tanpa Nama', transactionNumber, queueId],
  )
}

// ─── Auto-sync ────────────────────────────────────────────────────────────────

/**
 * Insert any status='open' transactions not yet in preparation_queue at all.
 * Runs on every GET /queue for robustness (handles orders created before this feature).
 */
async function syncMissingHoldOrders(): Promise<void> {
  await pool.query(`
    INSERT INTO preparation_queue
      (order_ref_id, order_type, transaction_number, customer_name, items, is_active, ordered_at)
    SELECT
      t.id,
      'hold',
      t.transaction_number,
      COALESCE(c.name, 'Tanpa Nama'),
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'name', ti.product_name,
              'qty',  ti.quantity,
              'notes', '',
              'addons', COALESCE(
                (
                  SELECT jsonb_agg(
                    CASE WHEN tioa.quantity > 1
                      THEN ao.name || ' (x' || tioa.quantity || ')'
                      ELSE ao.name
                    END
                  )
                  FROM transaction_item_add_ons tioa
                  LEFT JOIN add_ons ao ON tioa.add_on_id = ao.id
                  WHERE tioa.transaction_item_id = ti.id
                ),
                '[]'::jsonb
              ),
              'status', 'pending'
            )
            ORDER BY ti.created_at
          )
          FROM transaction_items ti
          WHERE ti.transaction_id = t.id
        ),
        '[]'::jsonb
      ),
      true,
      t.created_at
    FROM transactions t
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.status = 'open'
      AND t.id NOT IN (SELECT order_ref_id FROM preparation_queue)
  `)
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/queue
 * Returns is_active=true entries that have ≥1 pending/making item (pure FIFO).
 */
export const getQueue = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await syncMissingHoldOrders()

    const result = await pool.query(
      `SELECT id, order_ref_id, order_type, transaction_number,
              customer_name, items, is_active,
              queue_number, shift_id,
              ordered_at, created_at, updated_at
       FROM preparation_queue
       WHERE is_active = true
       ORDER BY ordered_at ASC`,
    )

    // Filter client-side for entries that still have actionable items
    const active = result.rows.filter((row: any) =>
      (row.items as QueueItemSnapshot[]).some(i => i.status !== 'done'),
    )

    res.json(successResponse(active, 'Antrian berhasil diambil'))
  } catch (error) {
    next(error)
  }
}

/**
 * PATCH /api/v1/queue/:id/item/:index
 * Advance a single item's status: pending → making → done.
 * If all items become done → soft delete the queue entry (is_active=false).
 */
export const advanceItemStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id, index } = req.params
    const itemIndex = parseInt(index)

    if (isNaN(itemIndex) || itemIndex < 0) {
      throw new AppError('VALIDATION_ERROR', 'Index item tidak valid', 400)
    }

    const existing = await pool.query(
      `SELECT id, items FROM preparation_queue WHERE id = $1 AND is_active = true`,
      [id],
    )

    if (existing.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Antrian tidak ditemukan', 404)
    }

    const items: QueueItemSnapshot[] = existing.rows[0].items

    if (!items[itemIndex]) {
      throw new AppError('NOT_FOUND', 'Item tidak ditemukan di antrian', 404)
    }

    const current = items[itemIndex].status
    const next: Record<string, ItemStatus> = { pending: 'making', making: 'done' }
    const nextStatus = next[current]

    if (!nextStatus) {
      throw new AppError('INVALID_STATUS', 'Item sudah selesai', 400)
    }

    items[itemIndex].status = nextStatus

    const allDone = items.every(i => i.status === 'done')

    if (allDone) {
      // Soft delete — semua item selesai
      await pool.query(
        `UPDATE preparation_queue SET items = $1, is_active = false WHERE id = $2`,
        [JSON.stringify(items), id],
      )
      return res.json(successResponse(
        { all_done: true, item_status: nextStatus, items },
        'Semua pesanan selesai dibuat',
      ))
    }

    await pool.query(
      `UPDATE preparation_queue SET items = $1 WHERE id = $2`,
      [JSON.stringify(items), id],
    )

    return res.json(successResponse(
      { all_done: false, item_status: nextStatus, items },
      'Status item diperbarui',
    ))
  } catch (error) {
    next(error)
    return
  }
}
