"use strict";

function createDownloadSelects(setIcon) {
  const controls = new WeakMap();
  let openControl;

  for (const select of document.querySelectorAll("select")) {
    const holder = document.createElement("span");
    holder.className = "select-field";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "select-trigger";
    trigger.id = select.id + "-trigger";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const value = document.createElement("span");
    value.id = select.id + "-value";
    value.className = "select-value";
    value.dir = "auto";
    const chevron = document.createElement("span");
    setIcon(chevron, "chevron-down");
    trigger.append(value, chevron);
    const list = document.createElement("div");
    list.id = select.id + "-choices";
    list.className = "select-options";
    list.setAttribute("role", "listbox");
    list.setAttribute("popover", "manual");
    list.hidden = true;
    trigger.setAttribute("aria-controls", list.id);
    holder.append(trigger, list);
    select.after(holder);
    select.hidden = true;
    const label = select.labels[0];
    if (label) {
      label.id ||= select.id + "-label";
      label.addEventListener("click", event => {
        event.preventDefault();
        trigger.focus();
      });
    }
    let active = -1, buffer = "", lastKey = 0, lastOptions;
    const options = () => [...select.options];
    const muted = option => option.disabled || option.hidden;

    function highlight(index) {
      active = index;
      list.querySelector("[data-active]")?.removeAttribute("data-active");
      const entry = list.children[index];
      if (!entry) {
        trigger.removeAttribute("aria-activedescendant");
        return;
      }
      entry.dataset.active = "";
      trigger.setAttribute("aria-activedescendant", entry.id);
      if (entry.offsetTop < list.scrollTop) list.scrollTop = entry.offsetTop;
      if (entry.offsetTop + entry.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = entry.offsetTop + entry.offsetHeight - list.clientHeight;
    }

    function sync() {
      const selected = select.selectedOptions[0]?.label || "";
      if (value.textContent !== selected) value.textContent = selected;
      trigger.disabled = select.disabled || !options().some(item => !muted(item));
      const accessibleLabel = label?.textContent.trim() || select.getAttribute("aria-label");
      if (label) trigger.setAttribute("aria-labelledby", label.id + " " + value.id);
      else if (accessibleLabel) trigger.setAttribute("aria-label", [accessibleLabel, value.textContent].filter(Boolean).join(": "));
      if (accessibleLabel) list.setAttribute("aria-label", accessibleLabel);
      if (trigger.disabled) close();
      else if (!list.hidden) paint();
    }

    function paint() {
      const items = options();
      const nextOptions = JSON.stringify(items.map(item => [item.value, item.label, item.selected, item.disabled, item.hidden]));
      if (lastOptions === nextOptions && list.children.length) { highlight(active); return; }
      lastOptions = nextOptions;
      list.replaceChildren(...items.map((item, index) => {
        const entry = document.createElement("div");
        entry.id = list.id + "-" + index;
        entry.setAttribute("role", "option");
        entry.setAttribute("aria-selected", String(item.selected));
        if (muted(item)) entry.setAttribute("aria-disabled", "true");
        entry.hidden = item.hidden;
        const label = document.createElement("span");
        label.dir = "auto";
        label.textContent = item.label;
        const mark = document.createElement("span");
        setIcon(mark, "check");
        entry.append(label, mark);
        entry.addEventListener("click", () => choose(index));
        return entry;
      }));
      highlight(items[active] && !muted(items[active]) ? active : items.findIndex(item => !muted(item)));
    }

    function close() {
      if (list.hidden) return;
      if (list.hidePopover && list.matches(":popover-open")) list.hidePopover();
      list.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
      buffer = "";
      if (openControl === control) openControl = null;
    }

    function open() {
      if (trigger.disabled || !list.hidden) return;
      openControl?.close();
      openControl = control;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(innerWidth - 16, Math.max(184, rect.width));
      const left = getComputedStyle(trigger).direction === "rtl" ? rect.right - width : rect.left;
      const above = Math.max(0, rect.top - 14), below = Math.max(0, innerHeight - rect.bottom - 14);
      const up = below < 220 && above > below;
      list.style.inlineSize = width + "px";
      list.style.left = Math.max(8, Math.min(left, innerWidth - 8 - width)) + "px";
      list.style.maxBlockSize = Math.min(260, up ? above : below) + "px";
      list.style.top = up ? "auto" : rect.bottom + 5 + "px";
      list.style.bottom = up ? innerHeight - rect.top + 5 + "px" : "auto";
      list.hidden = false;
      list.showPopover?.();
      trigger.setAttribute("aria-expanded", "true");
      active = select.selectedIndex;
      paint();
    }

    function choose(index) {
      const item = options()[index];
      if (!item || muted(item)) return;
      const changed = select.selectedIndex !== index;
      select.selectedIndex = index;
      close();
      trigger.focus({ preventScroll: true });
      sync();
      if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function move(key) {
      const enabled = options().map((item, index) => muted(item) ? -1 : index).filter(index => index !== -1);
      const position = enabled.indexOf(active);
      const next = key === "Home" ? 0 : key === "End" ? enabled.length - 1 :
        Math.max(0, Math.min(enabled.length - 1, position + (key === "ArrowUp" ? -1 : 1)));
      highlight(enabled[next]);
    }

    trigger.addEventListener("click", () => list.hidden ? open() : close());
    trigger.addEventListener("keydown", event => {
      if (event.key === "Tab" || event.key === "Escape") {
        if (!list.hidden && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        close();
      } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) {
          open();
          if (event.key === "Home" || event.key === "End") move(event.key);
        } else move(event.key);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (list.hidden) open();
        else choose(active);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (list.hidden) open();
        const key = event.key.normalize("NFKC").toLocaleLowerCase();
        const now = Date.now();
        buffer = now - lastKey > 650 || buffer === key ? key : buffer + key;
        lastKey = now;
        const items = options();
        for (let step = 1; step <= items.length; step++) {
          const index = (active + step) % items.length;
          if (!muted(items[index]) && items[index].label.normalize("NFKC").toLocaleLowerCase().startsWith(buffer)) {
            highlight(index);
            break;
          }
        }
      }
    });
    list.addEventListener("mousedown", event => { if (event.target.closest("[role=option]")) event.preventDefault(); });
    select.addEventListener("change", sync);
    const control = { sync, close, holder };
    controls.set(select, control);
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ["disabled", "selected", "hidden", "label", "aria-label"] });
    sync();
  }

  const outside = event => { if (openControl && !openControl.holder.contains(event.target)) openControl.close(); };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("focusin", outside);
  document.addEventListener("scroll", outside, true);
  window.addEventListener("resize", () => openControl?.close());
  return { sync: select => controls.get(select)?.sync(), close: () => openControl?.close() };
}
