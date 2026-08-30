import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { DownArrowIcon } from './icons'

export default function SelectDropdown({
  value,
  options,
  onChange,
  ariaLabel = 'Sélectionner une option',
  placeholder = 'Sélectionner…',
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  const selectedOption = options.find((option) => option.value === value)
  const activeLabel = selectedOption?.label || placeholder

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (!trigger) return

    const measuredHeight = menuRef.current?.getBoundingClientRect().height
    const expectedHeight = Math.min(210, Math.max(46, options.length * 34 + 12))
    const menuHeight = measuredHeight || expectedHeight
    const spaceBelow = window.innerHeight - trigger.bottom - 8
    const spaceAbove = trigger.top - 8
    const opensAbove = spaceBelow < Math.min(menuHeight, 160) && spaceAbove > spaceBelow
    const availableHeight = Math.max(76, (opensAbove ? spaceAbove : spaceBelow) - 6)
    const maxHeight = Math.min(210, availableHeight)
    const renderedHeight = Math.min(menuHeight, maxHeight)
    const top = opensAbove
      ? Math.max(8, trigger.top - renderedHeight - 6)
      : trigger.bottom + 6

    setMenuPosition({
      top,
      left: Math.max(8, Math.min(trigger.left, window.innerWidth - trigger.width - 8)),
      width: Math.min(trigger.width, window.innerWidth - 16),
      maxHeight,
    })
  }, [options.length])

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    placeMenu()
    const frame = window.requestAnimationFrame(placeMenu)
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, placeMenu])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [isOpen, placeMenu])

  const menu = isOpen && (
    <ul
      ref={menuRef}
      id={menuId}
      data-floating-layer-child
      className={`custom-dropdown-menu custom-dropdown-menu-portal ${className}`.trim()}
      role="listbox"
      aria-label={ariaLabel}
      style={menuPosition || { visibility: 'hidden' }}
    >
      {options.map((option) => (
        <li
          key={option.value}
          role="option"
          aria-selected={value === option.value}
          className={value === option.value ? 'selected' : ''}
          onClick={() => {
            onChange(option.value)
            setIsOpen(false)
          }}
        >
          {option.label}
        </li>
      ))}
    </ul>
  )

  return (
    <div
      ref={rootRef}
      className={`custom-dropdown ${className}`.trim()}
      data-menu-root
    >
      <button
        ref={triggerRef}
        type="button"
        className="custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          setMenuPosition(null)
          setIsOpen((current) => !current)
        }}
      >
        <span>{activeLabel}</span>
        <DownArrowIcon />
      </button>

      {menu && (typeof document === 'undefined' ? menu : createPortal(menu, document.body))}
    </div>
  )
}
