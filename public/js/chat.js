import { runAgent } from "./ai-agent.js";

const MAX_CHAT_LINES = 8;
const unangSabi =
  'Hi! Tell me what you spent, like "spent 150 on lunch". I also track utang: try "Ana owes me 200" or "I paid 900, split with Ben and Cris".';

export function initChat(kuninUser, kuninFriends = () => []) {
  const formUsap = document.getElementById("chat-form");
  const typeBox = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const logBox = document.getElementById("chat-log");

  let chatHist = [];
  let busyNa = false;

  function dagdagBubble(sulat, klaseNya) {
    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "bubble " + klaseNya;
    bubbleDiv.textContent = sulat;
    logBox.appendChild(bubbleDiv);
    logBox.scrollTop = logBox.scrollHeight;
    return bubbleDiv;
  }

  function reset() {
    chatHist = [];
    logBox.replaceChildren();
    dagdagBubble(unangSabi, "bot");
  }

  formUsap.addEventListener("submit", async (submitEvt) => {
    submitEvt.preventDefault();
    const sulatUser = typeBox.value.trim();
    const sinoUser = kuninUser();
    if (!sulatUser || busyNa || !sinoUser) return;

    busyNa = true;
    sendBtn.disabled = true;
    typeBox.value = "";
    dagdagBubble(sulatUser, "user");
    const waitBubble = dagdagBubble("Thinking...", "bot thinking");

    try {
      const sagotAi = await runAgent({ uid: sinoUser.uid, text: sulatUser, history: chatHist, friends: kuninFriends() });
      waitBubble.textContent = sagotAi;
      chatHist.push(
        { role: "user", parts: [{ text: sulatUser }] },
        { role: "model", parts: [{ text: sagotAi }] }
      );
      chatHist = chatHist.slice(-MAX_CHAT_LINES);
    } catch (siraChat) {
      console.error(siraChat);
      waitBubble.textContent = "Sorry, I couldn't reach the AI right now. Please try again in a moment.";
    } finally {
      waitBubble.classList.remove("thinking");
      busyNa = false;
      sendBtn.disabled = false;
      typeBox.focus();
    }
  });

  reset();
  return { reset };
}
