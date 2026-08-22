import { useState } from 'react'
import { modelLogoSrc } from '../../../utils/modelMetadata'

export default function ModelLogo({ alias, className = '', fallback = '' }) {
  const [hasError, setHasError] = useState(false)
  const logo = modelLogoSrc(alias)

  if (!logo || hasError) {
    return fallback ? <span className={className}>{fallback}</span> : null
  }

  return (
    <span className={className}>
      <img src={logo} alt="" onError={() => setHasError(true)} />
    </span>
  )
}
