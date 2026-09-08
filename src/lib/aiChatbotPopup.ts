export function openAiChatbotPopup() {
  const width = Math.min(520, window.screen.availWidth)
  const height = Math.min(820, window.screen.availHeight)
  const left = Math.max(0, window.screen.availWidth - width - 24)
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2))
  const popup = window.open(
    '/ai-chatbot-popup',
    'qualitics-ai-chatbot',
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  )
  popup?.focus()
}
