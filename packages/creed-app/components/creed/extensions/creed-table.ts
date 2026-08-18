// Table editing for the Creed file editor.
//
// Click types in a cell. Double-click selects a word. Click again in the
// same cell to drop the highlight. Drag across cells to highlight a row
// or column; Backspace removes it. Drag a highlighted row or column to
// reorder; a line shows the drop.

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
  CellSelection,
  cellAround,
  deleteColumn,
  deleteRow,
  deleteTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
  tableEditingKey,
} from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

export type TableAxis = "table" | "column" | "row";

export type TableRectLike = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TableMapLike = {
  width: number;
  height: number;
};

export function tableRowIsEmpty(row: ProseMirrorNode) {
  let empty = true;
  row.forEach((cell) => {
    if (cell.textContent.trim().length > 0) {
      empty = false;
    }
  });
  return empty;
}

export function tableHasHeaderRow(table: ProseMirrorNode) {
  const first = table.firstChild;
  if (!first) {
    return false;
  }
  let header = true;
  first.forEach((cell) => {
    if (cell.type.name !== "tableHeader") {
      header = false;
    }
  });
  return header;
}

export function tableAxisFromRect(
  rect: TableRectLike,
  map: TableMapLike,
  hasHeaderRow: boolean,
): TableAxis | null {
  const fullWidth = rect.left === 0 && rect.right === map.width;
  const fullHeight = rect.top === 0 && rect.bottom === map.height;
  const bodyTop = hasHeaderRow ? 1 : 0;
  const selectedBodyColumn =
    rect.top <= bodyTop &&
    rect.bottom === map.height &&
    rect.bottom - rect.top >= 2;

  if (fullWidth && fullHeight) {
    return "table";
  }
  if (fullWidth) {
    return "row";
  }
  if (fullHeight || selectedBodyColumn) {
    return "column";
  }
  return null;
}

export function deleteSelectedTableAxis(view: EditorView) {
  const { state } = view;
  if (!(state.selection instanceof CellSelection)) {
    return false;
  }
  const rect = selectedRect(state);
  const axis = tableAxisFromRect(rect, rect.map, tableHasHeaderRow(rect.table));
  if (!axis) {
    return false;
  }
  const ran =
    axis === "table"
      ? deleteTable(state, view.dispatch)
      : axis === "row"
        ? deleteRow(state, view.dispatch)
        : deleteColumn(state, view.dispatch);
  if (!ran || axis === "table") {
    return ran;
  }
  const after = view.state.selection;
  if (after instanceof CellSelection) {
    view.dispatch(
      view.state.tr.setSelection(TextSelection.near(after.$headCell, 1)),
    );
  }
  return true;
}

function nodeAtName($pos: ResolvedPos, name: string) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === name) {
      return $pos.node(depth);
    }
  }
  return null;
}

export function deleteEmptyTableRow(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) {
    return false;
  }
  const table = nodeAtName(selection.$from, "table");
  const row = nodeAtName(selection.$from, "tableRow");
  if (!table || !row || !tableRowIsEmpty(row)) {
    return false;
  }
  if (table.childCount <= 1) {
    return deleteTable(state, view.dispatch);
  }
  return deleteRow(state, view.dispatch);
}

function cellSelectionCount(selection: unknown) {
  if (!(selection instanceof CellSelection)) {
    return 0;
  }
  let count = 0;
  selection.forEachCell(() => {
    count += 1;
  });
  return count;
}

function clickIsInsideCellSelection(selection: CellSelection, pos: number) {
  let inside = false;
  selection.forEachCell((node, cellPos) => {
    if (pos >= cellPos && pos < cellPos + node.nodeSize) {
      inside = true;
    }
  });
  return inside;
}

function sameTableCell(doc: ProseMirrorNode, a: number, b: number) {
  const cellA = cellAround(doc.resolve(a));
  const cellB = cellAround(doc.resolve(b));
  return Boolean(cellA && cellB && cellA.pos === cellB.pos);
}

function eventElement(event: Event) {
  const target = event.target;
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Text) {
    return target.parentElement;
  }
  return null;
}

function eventTargetIsTableCell(view: EditorView, event: Event) {
  const node = eventElement(event);
  if (!node) {
    return false;
  }
  const cell = node.closest("td, th");
  return Boolean(cell && view.dom.contains(cell));
}

function nodeContains(root: Node, inner: Node) {
  if (root === inner) {
    return true;
  }
  return root.nodeType === Node.ELEMENT_NODE && root.contains(inner);
}

function caretInClickedNode(target: Node, event: MouseEvent) {
  if (
    target instanceof Element &&
    (target.classList.contains("ProseMirror") ||
      target.classList.contains("tableWrapper") ||
      target.tagName === "TABLE" ||
      target.tagName === "TBODY" ||
      target.tagName === "TR")
  ) {
    return null;
  }
  const doc = target.ownerDocument;
  if (!doc) {
    return null;
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && nodeContains(target, range.startContainer)) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  const host = doc as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const position = host.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (position && nodeContains(target, position.offsetNode)) {
    return { node: position.offsetNode, offset: position.offset };
  }
  return null;
}

function posFromClickedNode(view: EditorView, event: MouseEvent) {
  // caretRangeFromPoint can snap into the full-width table. Only keep a
  // range that still sits inside the node that received the click.
  const target = event.target;
  if (!(target instanceof Node)) {
    return null;
  }
  const root = target instanceof Element ? target : target.parentElement;
  if (!root || !view.dom.contains(root)) {
    return null;
  }
  try {
    const caret = caretInClickedNode(target, event);
    if (caret) {
      return view.posAtDOM(caret.node, caret.offset);
    }
    return view.posAtDOM(target, 0);
  } catch {
    return null;
  }
}

function wordAround(doc: ProseMirrorNode, pos: number) {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) {
    return TextSelection.near($pos, 1);
  }
  const text = $pos.parent.textContent;
  const offset = $pos.parentOffset;
  const letter = /[\p{L}\p{N}_]/u;
  let from = offset;
  let to = offset;
  while (from > 0 && letter.test(text[from - 1] ?? "")) {
    from -= 1;
  }
  while (to < text.length && letter.test(text[to] ?? "")) {
    to += 1;
  }
  if (from === to) {
    return TextSelection.near($pos, 1);
  }
  const start = $pos.start();
  return TextSelection.create(doc, start + from, start + to);
}

function placeCaretFromClick(view: EditorView, event: MouseEvent) {
  const pos = posFromClickedNode(view, event);
  if (pos == null) {
    return false;
  }
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near(view.state.doc.resolve(pos), 1))
      .scrollIntoView(),
  );
  return true;
}

function collapseToPos(view: EditorView, pos: number) {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))),
  );
}

function caretInCell(selection: CellSelection) {
  return TextSelection.near(selection.$headCell, 1);
}

function posAtMouse(view: EditorView, event: MouseEvent) {
  return view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
}

function clearTableEditing(view: EditorView) {
  if (tableEditingKey.getState(view.state) == null) {
    return;
  }
  view.dispatch(view.state.tr.setMeta(tableEditingKey, -1));
}

function selectionAxis(view: EditorView): TableAxis | null {
  const selection = view.state.selection;
  if (!(selection instanceof CellSelection) || cellSelectionCount(selection) < 2) {
    return null;
  }
  const rect = selectedRect(view.state);
  return tableAxisFromRect(rect, rect.map, tableHasHeaderRow(rect.table));
}

function tableDom(view: EditorView, tableStart: number) {
  const node = view.nodeDOM(tableStart - 1);
  if (node instanceof HTMLTableElement) {
    return node;
  }
  if (node instanceof HTMLElement) {
    return node.querySelector("table");
  }
  return null;
}

function dropIndex(
  table: HTMLTableElement,
  event: MouseEvent,
  axis: "row" | "column",
) {
  if (axis === "row") {
    const rows = [...table.rows];
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i].getBoundingClientRect();
      if (event.clientY < box.top + box.height / 2) {
        return i;
      }
    }
    return Math.max(0, rows.length - 1);
  }
  const cells = [...(table.rows[0]?.cells ?? [])];
  for (let i = 0; i < cells.length; i += 1) {
    const box = cells[i].getBoundingClientRect();
    if (event.clientX < box.left + box.width / 2) {
      return i;
    }
  }
  return Math.max(0, cells.length - 1);
}

function afterLastHalf(
  table: HTMLTableElement,
  event: MouseEvent,
  axis: "row" | "column",
) {
  if (axis === "row") {
    const row = table.rows[table.rows.length - 1];
    if (!row) {
      return false;
    }
    const box = row.getBoundingClientRect();
    return event.clientY >= box.top + box.height / 2;
  }
  const cell = table.rows[0]?.cells[table.rows[0].cells.length - 1];
  if (!cell) {
    return false;
  }
  const box = cell.getBoundingClientRect();
  return event.clientX >= box.left + box.width / 2;
}

function createDropLine() {
  const line = document.createElement("div");
  line.className = "creed-table-drop-line";
  line.setAttribute("aria-hidden", "true");
  document.body.appendChild(line);
  return line;
}

function ensureDropLine(line: HTMLDivElement | null) {
  return line ?? createDropLine();
}

function placeDropLine(
  line: HTMLDivElement,
  table: HTMLTableElement,
  axis: "row" | "column",
  index: number,
  afterLast: boolean,
) {
  const tableBox = table.getBoundingClientRect();
  line.style.display = "block";
  if (axis === "row") {
    const row = table.rows[Math.min(index, table.rows.length - 1)];
    if (!row) {
      return;
    }
    const box = row.getBoundingClientRect();
    const y = afterLast ? box.bottom : box.top;
    line.style.left = `${tableBox.left}px`;
    line.style.top = `${y - 1}px`;
    line.style.width = `${tableBox.width}px`;
    line.style.height = "2px";
    return;
  }
  const cell =
    table.rows[0]?.cells[Math.min(index, (table.rows[0]?.cells.length ?? 1) - 1)];
  if (!cell) {
    return;
  }
  const box = cell.getBoundingClientRect();
  const x = afterLast ? box.right : box.left;
  line.style.left = `${x - 1}px`;
  line.style.top = `${tableBox.top}px`;
  line.style.width = "2px";
  line.style.height = `${tableBox.height}px`;
}

function hideDropLine(line: HTMLDivElement) {
  line.style.display = "none";
}

function startAxisReorder(
  view: EditorView,
  down: MouseEvent,
  axis: "row" | "column",
  line: HTMLDivElement,
  onHold: () => void,
) {
  const startRect = selectedRect(view.state);
  const tableStart = startRect.tableStart;
  const originIndex = axis === "row" ? startRect.top : startRect.left;
  const startX = down.clientX;
  const startY = down.clientY;
  let dragging = false;
  let dropAt = originIndex;
  let finished = false;

  const stop = () => {
    if (finished) {
      return;
    }
    finished = true;
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
    view.dom.style.removeProperty("cursor");
    hideDropLine(line);
  };

  const onMove = (event: MouseEvent) => {
    event.stopPropagation();
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < 6) {
        return;
      }
      dragging = true;
      view.dom.style.cursor = "grabbing";
    }
    event.preventDefault();
    const table = tableDom(view, tableStart);
    if (!table) {
      return;
    }
    dropAt = dropIndex(table, event, axis);
    placeDropLine(
      line,
      table,
      axis,
      dropAt,
      afterLastHalf(table, event, axis),
    );
  };

  const onUp = () => {
    const shouldMove = dragging && dropAt !== originIndex;
    stop();
    if (!shouldMove) {
      return;
    }
    const command =
      axis === "row"
        ? moveTableRow({
            from: originIndex,
            to: dropAt,
            select: true,
            pos: tableStart,
          })
        : moveTableColumn({
            from: originIndex,
            to: dropAt,
            select: true,
            pos: tableStart,
          });
    if (command(view.state, view.dispatch)) {
      onHold();
    }
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  return stop;
}

function ensureCols(table: HTMLTableElement, count: number) {
  let group = table.querySelector("colgroup");
  if (!group) {
    group = document.createElement("colgroup");
    table.prepend(group);
  }
  if (group.querySelectorAll("col").length === count) {
    return [...group.querySelectorAll("col")];
  }
  group.replaceChildren(
    ...Array.from({ length: count }, () => document.createElement("col")),
  );
  return [...group.querySelectorAll("col")];
}

function layoutTable(table: HTMLTableElement) {
  const firstRow = table.rows[0];
  if (!firstRow) {
    return;
  }
  const colCount = firstRow.cells.length;
  if (colCount === 0) {
    return;
  }
  table.style.width = "100%";
  table.style.minWidth = "100%";
  const even = `${100 / colCount}%`;
  for (const col of ensureCols(table, colCount)) {
    col.style.width = even;
    col.style.minWidth = "0";
  }
}

function layoutTables(view: EditorView) {
  view.dom
    .querySelectorAll<HTMLTableElement>("table.creed-table")
    .forEach(layoutTable);
}

export const CreedTable = Extension.create({
  name: "creedTable",

  addProseMirrorPlugins() {
    let holdCellSelection = false;
    let dropLine: HTMLDivElement | null = null;
    let stopReorder: (() => void) | null = null;

    return [
      new Plugin({
        key: new PluginKey("creedTable"),
        props: {
          createSelectionBetween(view) {
            const selection = view.state.selection;
            if (
              !holdCellSelection ||
              !(selection instanceof CellSelection) ||
              cellSelectionCount(selection) < 2
            ) {
              holdCellSelection = false;
              return null;
            }
            return selection;
          },
          handleClick(view, pos, event) {
            if (!eventTargetIsTableCell(view, event)) {
              holdCellSelection = false;
              // Shift-click must reach ProseMirror so it can extend the range.
              if (event.shiftKey || eventElement(event)?.closest("label")) {
                return false;
              }
              return placeCaretFromClick(view, event);
            }
            const selection = view.state.selection;
            // In a cell, a click on a text highlight does not collapse the
            // range the way it does in a paragraph. Place the caret ourselves.
            if (
              event.detail === 1 &&
              selection instanceof TextSelection &&
              !selection.empty &&
              sameTableCell(view.state.doc, selection.from, pos)
            ) {
              collapseToPos(view, pos);
              return true;
            }
            if (
              !(selection instanceof CellSelection) ||
              cellSelectionCount(selection) < 2
            ) {
              return false;
            }
            if (clickIsInsideCellSelection(selection, pos)) {
              return true;
            }
            holdCellSelection = false;
            return false;
          },
          handleDoubleClick(view, _pos, event) {
            if (event.shiftKey || eventTargetIsTableCell(view, event)) {
              return false;
            }
            const pos = posFromClickedNode(view, event);
            if (pos == null) {
              return false;
            }
            view.dispatch(
              view.state.tr.setSelection(wordAround(view.state.doc, pos)),
            );
            return true;
          },
          handleTripleClick(view, pos, event) {
            if (event.shiftKey) {
              return false;
            }
            const at = eventTargetIsTableCell(view, event)
              ? pos
              : posFromClickedNode(view, event);
            if (at == null) {
              return false;
            }
            const $pos = view.state.doc.resolve(at);
            if (!$pos.parent.isTextblock) {
              return false;
            }
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, $pos.start(), $pos.end()),
              ),
            );
            return true;
          },
          handleDOMEvents: {
            mousedown(view, event) {
              if (!eventTargetIsTableCell(view, event)) {
                holdCellSelection = false;
                clearTableEditing(view);
                return false;
              }
              const pos = posAtMouse(view, event);
              const selection = view.state.selection;
              if (
                selection instanceof CellSelection &&
                cellSelectionCount(selection) >= 2
              ) {
                if (
                  pos == null ||
                  !clickIsInsideCellSelection(selection, pos)
                ) {
                  holdCellSelection = false;
                  return false;
                }
                event.preventDefault();
                const axis = selectionAxis(view);
                if (axis === "row" || axis === "column") {
                  dropLine = ensureDropLine(dropLine);
                  stopReorder?.();
                  stopReorder = startAxisReorder(
                    view,
                    event,
                    axis,
                    dropLine,
                    () => {
                      holdCellSelection = true;
                    },
                  );
                }
                return true;
              }
              if (
                pos == null ||
                event.button !== 0 ||
                event.shiftKey ||
                event.detail !== 1 ||
                !(selection instanceof TextSelection) ||
                selection.empty
              ) {
                return false;
              }
              if (
                pos < selection.from ||
                pos > selection.to ||
                !sameTableCell(view.state.doc, selection.from, pos)
              ) {
                return false;
              }
              event.preventDefault();
              collapseToPos(view, pos);
              return true;
            },
          },
          handleKeyDown(view, event) {
            if (event.key !== "Backspace" && event.key !== "Delete") {
              return false;
            }
            if (deleteSelectedTableAxis(view)) {
              holdCellSelection = false;
              event.preventDefault();
              return true;
            }
            if (event.key === "Backspace" && deleteEmptyTableRow(view)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
        appendTransaction(_transactions, _oldState, state) {
          // tableEditing turns a cell NodeSelection into a one-cell
          // CellSelection. A caret is the click-to-type target, except when
          // that one cell is a full row or column.
          const selection = state.selection;
          if (
            !(selection instanceof CellSelection) ||
            cellSelectionCount(selection) !== 1
          ) {
            return null;
          }
          const rect = selectedRect(state);
          const axis = tableAxisFromRect(
            rect,
            rect.map,
            tableHasHeaderRow(rect.table),
          );
          if (axis === "row" || axis === "column") {
            return null;
          }
          return state.tr.setSelection(caretInCell(selection));
        },
        view(editorView) {
          let frame = 0;
          const schedule = () => {
            if (frame) {
              return;
            }
            frame = requestAnimationFrame(() => {
              frame = 0;
              layoutTables(editorView);
            });
          };
          const observer = new ResizeObserver(schedule);
          observer.observe(editorView.dom);
          schedule();
          return {
            update(view) {
              schedule();
              if (cellSelectionCount(view.state.selection) > 1) {
                holdCellSelection = true;
              }
            },
            destroy() {
              stopReorder?.();
              stopReorder = null;
              observer.disconnect();
              dropLine?.remove();
              dropLine = null;
              if (frame) {
                cancelAnimationFrame(frame);
              }
            },
          };
        },
      }),
    ];
  },
});
