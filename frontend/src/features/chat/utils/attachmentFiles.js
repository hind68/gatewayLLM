export const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
]

export const TEXT_EXTENSIONS = [
  '.txt', '.md', '.log', '.ini', '.cfg', '.conf', '.toml', '.yml', '.yaml',
]

export const CODE_EXTENSIONS = [
  '.py', '.pyw', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.java',
  '.js', '.jsx', '.ts', '.tsx', '.go', '.rb', '.php', '.rs', '.swift',
  '.kt', '.kts', '.scala', '.sh', '.bash', '.ps1', '.sql', '.r',
  '.json', '.xml', '.html', '.htm', '.css',
]

export const DOCUMENT_EXTENSIONS = [
  '.pdf', '.docx', '.pptx', '.csv', '.xlsx', '.zip',
]

export const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  ...DOCUMENT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...CODE_EXTENSIONS,
]

const FILE_TYPE_ICONS_DIR = '/assets/files%20types'

const SPECIFIC_FILE_ICONS = {
  csv: `${FILE_TYPE_ICONS_DIR}/sheets.png`,
  doc: `${FILE_TYPE_ICONS_DIR}/doc.png`,
  docx: `${FILE_TYPE_ICONS_DIR}/doc.png`,
  pdf: `${FILE_TYPE_ICONS_DIR}/pdf.png`,
  ppt: `${FILE_TYPE_ICONS_DIR}/ppt.png`,
  pptx: `${FILE_TYPE_ICONS_DIR}/ppt.png`,
  xls: `${FILE_TYPE_ICONS_DIR}/sheets.png`,
  xlsx: `${FILE_TYPE_ICONS_DIR}/sheets.png`,
  zip: '/assets/zip.png',
}

export function getAttachmentIconSrc(filename) {
  const extension = fileExtension(filename)
  if (SPECIFIC_FILE_ICONS[extension]) return SPECIFIC_FILE_ICONS[extension]
  if (hasExtension(extension, IMAGE_EXTENSIONS)) return `${FILE_TYPE_ICONS_DIR}/image.png`
  if (hasExtension(extension, CODE_EXTENSIONS)) return `${FILE_TYPE_ICONS_DIR}/code.png`
  if (hasExtension(extension, TEXT_EXTENSIONS)) return `${FILE_TYPE_ICONS_DIR}/text.png`
  return '/assets/document.png'
}

export function fileExtension(filename) {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

function hasExtension(extension, extensions) {
  return extensions.includes(`.${extension}`)
}
