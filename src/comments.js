const Soft98Comments = (() => {
  "use strict";

  const PANE = "data-soft98-pro-comments";
  const PART = "data-soft98-pro-comments-part";
  const STRUCTURE = "data-soft98-pro-comments-structure";

  function directChild(parent, descendant) {
    let child = descendant;
    while (child && child !== parent && child.parentElement !== parent) child = child.parentElement;
    return child?.parentElement === parent ? child : null;
  }

  function findStructure(pane, form, editor) {
    const nodes = new Map();
    const mark = (node, part) => {
      if (node) nodes.set(node, part);
    };
    for (const alert of form.querySelectorAll('[role="alert"]')) {
      if (alert.hasAttribute("data-toggle") || alert.querySelector('[data-toggle="collapse"], [data-toggle="mbd"], a[href]')) {
        mark(alert, "notice");
        const group = directChild(form, alert);
        if (group !== alert && !group?.contains(editor)) mark(group, "notices");
      }
    }

    const submit = form.querySelector('[data-toggle="comment-add-save"], [type="submit"]');
    let fields = editor.parentElement;
    while (fields !== form && !fields.contains(submit)) fields = fields.parentElement;
    if (fields !== form) {
      mark(fields, "fields");
      const shell = fields.parentElement;
      if (shell !== form) {
        const heading = [...shell.children].find((child) =>
          child !== fields && (child.matches("h2,h3,h4,h5,h6") || child.querySelector("h2,h3,h4,h5,h6")));
        if (heading) {
          mark(shell, "composer");
          mark(heading, "composerHeading");
        }
      }
      for (const input of form.querySelectorAll('input:is([name="name"], [name="mail"])')) {
        mark(directChild(fields, input), "identity");
      }
    }

    for (const listHost of pane.querySelectorAll("#dle-comments-list, #dle-ajax-comments")) {
      for (const comment of listHost.querySelectorAll("[data-comment_id]")) {
        if (comment.closest("#dle-comments-list, #dle-ajax-comments") !== listHost) continue;
        const body = comment.querySelector('[id^="comm-id-"]');
        if (!body || body.closest("[data-comment_id]") !== comment) continue;
        mark(comment, "comment");
        mark(directChild(comment, body), "body");
        const action = comment.querySelector('[data-toggle^="comment-"]');
        const author = comment.querySelector("strong");
        const header = directChild(comment, action || author);
        if (header && !header.contains(body)) {
          mark(header, "meta");
          mark(directChild(header, action?.closest('[role="group"]') || action), "actions");
        }
        const item = comment.closest("li");
        if (item?.parentElement.matches("ol") && listHost.contains(item)) {
          mark(item, "item");
          mark(item.parentElement, "thread");
        }
      }
    }
    return nodes;
  }

  function updateStructure(record, next) {
    for (const node of record.structure?.keys() || []) {
      if (!next.has(node)) node.removeAttribute(STRUCTURE);
    }
    for (const [node, part] of next) {
      if (node.getAttribute(STRUCTURE) !== part) node.setAttribute(STRUCTURE, part);
    }
    record.structure = next;
  }

  function create(document) {
    const panes = new Map();

    function syncPart(record, part, host, tag, value, place) {
      let node = record[part];
      const copies = [...record.pane.querySelectorAll(`[${PART}="${part}"]`)]
        .filter((copy) => copy.closest(`[${PANE}]`) === record.pane);
      if (!value || !host) {
        node?.remove();
        for (const copy of copies) copy.remove();
        delete record[part];
        return null;
      }
      if (node?.parentNode !== host) {
        const replacement = copies.find((copy) => copy.parentNode === host && copy.localName === tag);
        if (replacement) {
          node?.remove();
          node = record[part] = replacement;
        }
      }
      if (!node) {
        node = record[part] = document.createElement(tag);
        node.setAttribute(PART, part);
      }
      for (const copy of copies) if (copy !== node) copy.remove();
      if (node.textContent !== value) node.textContent = value;
      if (node.parentNode !== host) host[place](node);
      return node;
    }

    function sync({ enabled = true, text = () => "" } = {}) {
      const active = new Set();
      if (enabled) {
        for (const form of document.querySelectorAll('article form[name="comment-add-form"]')) {
          const pane = form.closest('[role="tabpanel"]');
          const editor = form.querySelector('textarea[name="comments"]');
          if (!pane || !pane.closest("article") || editor?.form !== form || active.has(pane)) continue;
          active.add(pane);

          const record = panes.get(pane) || { pane };
          panes.set(pane, record);
          if (!pane.hasAttribute(PANE)) pane.setAttribute(PANE, "");
          updateStructure(record, findStructure(pane, form, editor));
          syncPart(record, "title", pane, "h2", text("comments.title"), "prepend");
          syncPart(record, "empty", pane, "p", text("comments.empty"), "append");

          const named = editor.hasAttribute("aria-label") || editor.hasAttribute("aria-labelledby") ||
            [...editor.labels].some((label) => label.getAttribute(PART) !== "editorLabel");
          const canLabel = !named && editor.id && document.getElementById(editor.id) === editor;
          const label = syncPart(record, "editorLabel", canLabel ? editor.parentElement : null, "label",
            canLabel ? text("comments.editorLabel") : "", "append");
          if (label && label.htmlFor !== editor.id) label.htmlFor = editor.id;
        }
      }

      for (const [pane, record] of panes) {
        if (active.has(pane)) continue;
        updateStructure(record, new Map());
        for (const part of ["title", "empty", "editorLabel"]) syncPart(record, part);
        pane.removeAttribute(PANE);
        panes.delete(pane);
      }
      for (const pane of document.querySelectorAll(`[${PANE}]`)) {
        if (active.has(pane)) continue;
        for (const node of pane.querySelectorAll(`[${PART}], [${STRUCTURE}]`)) {
          if (node.closest(`[${PANE}]`) !== pane) continue;
          if (node.hasAttribute(PART)) node.remove();
          else node.removeAttribute(STRUCTURE);
        }
        pane.removeAttribute(PANE);
      }
    }

    return { sync };
  }

  return { create };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Soft98Comments;
