// Shared incubation-status and exit-date helpers used by both the Manager and
// Technician views. The previous per-view copies had drifted in the manual
// unlock label ordering; this is the canonical implementation.

export function getDaysRemainingForDate(exitDateStr) {
  if (!exitDateStr) return null
  const today = new Date().toISOString().slice(0, 10)
  const todayDate = new Date(today)
  const exitDate = new Date(exitDateStr)
  const diffTime = exitDate.getTime() - todayDate.getTime()
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
}

export function formatExitText(exitDateStr, t) {
  const days = getDaysRemainingForDate(exitDateStr)
  if (days === null) return ''
  if (days === 0) return t('tech.batch.exits_today')
  if (days === 1) return t('tech.batch.exits_tomorrow')
  return t('tech.batch.exits_in').replace('{n}', days)
}

export function getIncubationStatus(batch, template, t) {
  if (!template || !batch) return { required: false, locked: false, label: t('status.ready') }

  if (template.requires_incubation === false) {
    return { required: false, locked: false, label: t('status.ready') }
  }

  const needs36 = (batch.units_36 || 0) > 0 && (template.incubation_36 || 0) > 0
  const needs55 = (batch.units_55 || 0) > 0 && (template.incubation_55 || 0) > 0
  const required = needs36 || needs55

  // A manual unlock by an admin overrides all incubation blocks
  if (batch.is_manually_unlocked) {
    return { required, locked: false, label: t('status.unlocked_override') || t('status.unlocked_admin') }
  }

  const exited = !!(batch.incubation_exited_at || batch.incubation_removed_early_at)
  const today = new Date().toISOString().slice(0, 10)
  const due36 = needs36 ? (batch.exit_36 && batch.exit_36 <= today) : false
  const due55 = needs55 ? (batch.exit_55 && batch.exit_55 <= today) : false

  const is36Locked = needs36 && !due36 && !exited
  const is55Locked = needs55 && !due55 && !exited

  // The batch as a whole is locked only if ALL configured chambers are still locked
  const locked = required && !exited && (needs36 ? is36Locked : true) && (needs55 ? is55Locked : true)

  // The batch is due if any chamber is due and not yet exited
  const due = required && !exited && (due36 || due55)

  let label = t('status.ready')
  if (required) {
    if (exited) {
      label = t('status.exited')
    } else if (is36Locked && is55Locked) {
      label = t('status.in_incubation')
    } else if (!is36Locked && is55Locked) {
      label = t('status.partial_36_exited') || '36°C Exited / 55°C Incubating'
    } else if (is36Locked && !is55Locked) {
      label = t('status.partial_55_exited') || '55°C Exited / 36°C Incubating'
    } else {
      label = t('status.due')
    }
  }

  let daysRemaining = 0
  if (locked) {
    const activeExits = []
    if (is36Locked && batch.exit_36) activeExits.push(new Date(batch.exit_36))
    if (is55Locked && batch.exit_55) activeExits.push(new Date(batch.exit_55))

    if (activeExits.length > 0) {
      const latestExit = new Date(Math.max(...activeExits))
      const todayDate = new Date(today)
      const diffTime = latestExit.getTime() - todayDate.getTime()
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    }
  }

  return { required, locked, due, exited, label, daysRemaining, is36Locked, is55Locked }
}