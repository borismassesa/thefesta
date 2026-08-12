/** Product-wide Opus button contract shared by every application. */
export type OpusButtonVariant =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'danger'
  | 'warning'
  | 'tertiary'

export type OpusButtonSize = 'large' | 'medium' | 'small' | 'icon-medium' | 'icon-small'

export function opusButtonClass({
  variant = 'primary',
  size = 'medium',
}: {
  variant?: OpusButtonVariant
  size?: OpusButtonSize
} = {}): string {
  return `opus-button opus-button--${variant} opus-button--${size}`
}
