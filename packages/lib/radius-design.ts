/** Product-wide radius contract shared by every web application. */
export type OpusRadiusSize = 'small' | 'medium' | 'large' | 'xlarge' | 'round'

export function opusRadiusClass(size: OpusRadiusSize = 'medium'): string {
  return `opus-radius--${size}`
}
