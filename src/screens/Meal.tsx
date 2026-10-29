// Meal screen: foods with macros, + to add, swipe and press-and-hold actions (spec §4.2, §5).
import { ArrowsLeftRight, BookmarkSimple, Copy, DotsThreeCircle, PencilSimple, Plus, Star, Trash } from '@phosphor-icons/react'
import { PushedScreen } from '../components/Screen'
import { SwipeRow } from '../components/SwipeRow'
import { Button, EmptyState, Field } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { ActionMenu } from '../components/SwipeRow'
import { ForkKnife } from '@phosphor-icons/react'
import { useDay, useList } from '../lib/store'
import { copyToToday, deleteEntry, isFavorite, moveEntry, toggleFavorite } from '../lib/logging'
import { amountLabel, fmt, hourLabel, r0 } from '../lib/format'
import { SaveMealSheet } from './SavedMeals'
import { displayMeal, mealLabel, mealsFor, removeExtraMeal, renameExtraMeal } from '../lib/meals'
import { getState, useStore } from '../lib/store'
import { closeSheet, confirm, openSheet, popScreen, showOverlay, toast } from '../lib/ui'
import { useState } from 'react'
import { editEntry, openLog } from './Log'
import { useToday } from '../lib/derived'
import type { FoodEntry, FoodTemplate, Meal } from '../../shared/types'

export function MealScreen({ date, meal }: { date: string; meal: Meal }) {
  const day = useDay(date)
  useList<FoodTemplate>('favorites') // re-render when favorites change
  const today = useToday()
  const profile = useStore((s) => s.profile)
  const isExtra = !!profile?.extraMeals?.some((m) => m.id === meal)
  const foods = day.foods.filter((f) => displayMeal(f.meal, profile) === meal)
  const total = foods.reduce((a, f) => ({ cal: a.cal + f.cal, p: a.p + f.p, c: a.c + f.c, f: a.f + f.f }), { cal: 0, p: 0, c: 0, f: 0 })

  return (
    <PushedScreen
      title={mealLabel(meal)}
      right={
        <span className="nav-actions">
          {isExtra && (
            <button
              className="icon-btn pressable"
              aria-label={`${mealLabel(meal)} options`}
              onClick={() =>
                showOverlay(
                  <ActionMenu
                    title={<strong>{mealLabel(meal)}</strong>}
                    actions={[
                      { label: 'Rename', icon: <PencilSimple size={18} />, run: () => openSheet(<RenameMealSheet id={meal} />) },
                      {
                        label: 'Remove this meal',
                        icon: <Trash size={18} />,
                        destructive: true,
                        run: async () => {
                          const ok = await confirm({
                            title: `Remove ${mealLabel(meal)}?`,
                            message: 'Foods already logged here will show under Snacks.',
                            confirm: 'Remove',
                            destructive: true,
                          })
                          if (!ok) return
                          removeExtraMeal(meal)
                          popScreen()
                          toast('Meal removed')
                        },
                      },
                    ]}
                  />,
                )
              }
            >
              <DotsThreeCircle size={24} />
            </button>
          )}
          <button className="icon-btn pressable" onClick={() => openLog(date, meal)} aria-label={`Add to ${mealLabel(meal)}`}>
            <Plus size={24} weight="bold" />
          </button>
        </span>
      }
    >
      <div className="meal-total">
        <span className="big-number">{fmt(r0(total.cal))}</span>
        <span className="muted"> cal</span>
        <div className="plan-macros">
          <span>
            <b style={{ color: 'var(--protein)' }}>P</b> {r0(total.p)} g
          </span>
          <span>
            <b style={{ color: 'var(--carbs)' }}>C</b> {r0(total.c)} g
          </span>
          <span>
            <b style={{ color: 'var(--fat)' }}>F</b> {r0(total.f)} g
          </span>
        </div>
      </div>

      {foods.length === 0 ? (
        <EmptyState
          icon={ForkKnife}
          text={`Nothing for ${mealLabel(meal).toLowerCase()} yet.`}
          action={<Button onClick={() => openLog(date, meal)}>+ Add to {mealLabel(meal)}</Button>}
        />
      ) : (
        <div className="group-body">
          {[...foods].sort((a, b) => a.at.localeCompare(b.at)).map((e) => (
            <FoodRow key={e.id} e={e} date={date} today={today} />
          ))}
        </div>
      )}
      {foods.length > 1 && (
        <button
          className="add-meal"
          onClick={() =>
            openSheet(
              <SaveMealSheet
                name={mealLabel(meal)}
                items={foods.map((f) => ({ foodId: f.foodId, name: f.name, qty: f.qty, unit: f.unit, cal: f.cal, p: f.p, c: f.c, f: f.f }))}
              />,
            )
          }
        >
          <BookmarkSimple size={16} weight="bold" aria-hidden /> Save as a meal
        </button>
      )}
    </PushedScreen>
  )
}

function FoodRow({ e, date, today }: { e: FoodEntry; date: string; today: string }) {
  const fav = isFavorite(e)
  const label = `${e.name}, ${fmt(e.qty, 2)} ${e.unit}, ${r0(e.cal)} calories`
  return (
    <SwipeRow
      label={label}
      onTap={() => void editEntry(date, e)}
      onDelete={() => deleteEntry(date, e.id)}
      onFavorite={() => toggleFavorite(e)}
      favorite={fav}
      menu={[
        { label: 'Edit portion or time', icon: <PencilSimple size={18} />, run: () => void editEntry(date, e) },
        { label: 'Move to…', icon: <ArrowsLeftRight size={18} />, run: () => showOverlay(<MovePicker date={date} e={e} />) },
        ...(date !== today ? [{ label: 'Copy to today', icon: <Copy size={18} />, run: () => copyToToday(e) }] : []),
        { label: fav ? 'Remove favorite' : 'Favorite', icon: <Star size={18} weight={fav ? 'fill' : 'regular'} />, run: () => toggleFavorite(e) },
        { label: 'Delete', icon: <Trash size={18} />, destructive: true, run: () => deleteEntry(date, e.id) },
      ]}
    >
      <span className="row-main">
        <span className="row-label">
          {e.name} {fav && <Star size={12} weight="fill" className="fav-star" aria-hidden />}
        </span>
        <span className="row-sub">
          {hourLabel(e.at) && <span className="row-time">{hourLabel(e.at)} · </span>}
          {amountLabel(e.qty, e.unit)} · P {r0(e.p)} · C {r0(e.c)} · F {r0(e.f)}
        </span>
      </span>
      <span className="row-value">{fmt(r0(e.cal))}</span>
    </SwipeRow>
  )
}

function MovePicker({ date, e }: { date: string; e: FoodEntry }) {
  return (
    <div className="menu-wrap" onClick={() => showOverlay(null)}>
      <div className="menu" role="menu" onClick={(ev) => ev.stopPropagation()}>
        <p className="menu-head">Move to…</p>
        {mealsFor(getState().profile)
          .map((x) => x.id)
          .filter((m) => m !== e.meal)
          .map((m) => (
          <button
            key={m}
            className="menu-item"
            role="menuitem"
            onClick={() => {
              showOverlay(null)
              moveEntry(date, e.id, m)
            }}
          >
            {mealLabel(m)}
          </button>
        ))}
      </div>
    </div>
  )
}


function RenameMealSheet({ id }: { id: string }) {
  const [name, setName] = useState(mealLabel(id))
  return (
    <Sheet title="Rename meal">
      <Field label="Meal name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus placeholder="e.g. Pre-workout" />
      <Button
        className="sheet-cta"
        disabled={!name.trim()}
        onClick={() => {
          renameExtraMeal(id, name)
          closeSheet()
          toast('Meal renamed')
        }}
      >
        Save
      </Button>
    </Sheet>
  )
}
