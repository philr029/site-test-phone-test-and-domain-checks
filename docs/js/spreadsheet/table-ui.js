/**
 * Responsive spreadsheet table — sort, filter, pagination, resize, virtual scroll, sticky header.
 */
import { DEFAULT_PAGE_SIZE, VIRTUAL_ROW_HEIGHT } from './constants.js';

const VIRTUAL_SCROLL_THRESHOLD = 200;

export class SpreadsheetTable {
  /**
   * @param {HTMLElement} container
   * @param {object} options
   */
  constructor(container, options = {}) {
    this.container = container;
    this.headers = options.headers ?? [];
    this.rows = options.rows ?? [];
    this.viewMode = options.viewMode ?? 'raw';
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.usePagination = options.usePagination ?? true;
    this.useVirtualScroll = options.useVirtualScroll ?? false;
    this.highlightErrors = options.highlightErrors ?? true;
    this.onChange = options.onChange ?? (() => {});

    this.sortCol = null;
    this.sortDir = 'asc';
    this.filters = {};
    this.globalFilter = '';
    this.page = 1;
    this.colWidths = this.headers.map(() => 140);
    this.filteredRows = [...this.rows];
    this._scrollTop = 0;
    this._scrollHandler = null;

    this.render();
  }

  getCellValue(row, colIdx) {
    const cells = this.viewMode === 'cleaned' ? row.cleaned ?? row.cells : row.cells;
    return cells[colIdx] ?? '';
  }

  shouldUseVirtualScroll(rowCount) {
    return this.useVirtualScroll || rowCount > VIRTUAL_SCROLL_THRESHOLD;
  }

  applyFiltersAndSort() {
    let rows = [...this.rows];

    if (this.globalFilter) {
      const q = this.globalFilter.toLowerCase();
      rows = rows.filter((row) =>
        (this.viewMode === 'cleaned' ? row.cleaned ?? row.cells : row.cells)
          .some((c) => String(c).toLowerCase().includes(q))
      );
    }

    Object.entries(this.filters).forEach(([colIdx, val]) => {
      if (!val) return;
      const q = val.toLowerCase();
      rows = rows.filter((row) => String(this.getCellValue(row, Number(colIdx))).toLowerCase().includes(q));
    });

    if (this.sortCol !== null) {
      const col = this.sortCol;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const av = String(this.getCellValue(a, col)).toLowerCase();
        const bv = String(this.getCellValue(b, col)).toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }

    this.filteredRows = rows;
    const maxPage = Math.max(1, Math.ceil(rows.length / this.pageSize));
    if (this.page > maxPage) this.page = maxPage;
  }

  setData({ headers, rows, viewMode }) {
    if (headers) {
      this.headers = headers;
      if (this.colWidths.length !== headers.length) {
        this.colWidths = headers.map((_, i) => this.colWidths[i] ?? 140);
      }
    }
    if (rows) this.rows = rows;
    if (viewMode) this.viewMode = viewMode;
    this._scrollTop = 0;
    this.applyFiltersAndSort();
    this.render();
  }

  render() {
    this.applyFiltersAndSort();
    const total = this.filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    const start = this.usePagination ? (this.page - 1) * this.pageSize : 0;
    const end = this.usePagination ? start + this.pageSize : total;
    const pageRows = this.filteredRows.slice(start, end);
    const virtual = this.shouldUseVirtualScroll(pageRows.length);
    const colSpan = this.headers.length + 2;

    this.container.innerHTML = `
      <div class="sheet-toolbar">
        <div class="sheet-toolbar-left">
          <input type="search" class="sheet-search" placeholder="Search all columns…" value="${this.escapeAttr(this.globalFilter)}" data-action="global-filter" />
          <span class="muted sheet-row-count">${total.toLocaleString()} rows${virtual ? ' · virtual scroll' : ''}</span>
        </div>
        <div class="sheet-toolbar-right">
          ${this.usePagination ? `
            <label class="sheet-page-size">
              Rows
              <select data-action="page-size">
                ${[25, 50, 100, 250, 500].map((n) => `<option value="${n}" ${n === this.pageSize ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </label>
          ` : ''}
        </div>
      </div>
      <div class="sheet-table-wrap" data-virtual="${virtual}">
        <table class="data-table sheet-table">
          <thead class="sheet-thead-sticky">
            <tr>
              <th class="sheet-row-num" style="width:48px">#</th>
              ${this.headers.map((h, i) => `
                <th style="width:${this.colWidths[i]}px; min-width:60px" data-col="${i}" class="sheet-th ${this.sortCol === i ? `sorted-${this.sortDir}` : ''}">
                  <button type="button" class="sheet-sort-btn" data-action="sort" data-col="${i}">
                    ${this.escapeHtml(h)}
                    ${this.sortCol === i ? (this.sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                  <span class="sheet-col-resize" data-action="resize" data-col="${i}"></span>
                </th>
              `).join('')}
              <th style="width:80px">Valid</th>
            </tr>
            <tr class="sheet-filter-row">
              <th></th>
              ${this.headers.map((_, i) => `
                <th>
                  <input type="text" class="sheet-col-filter" placeholder="Filter" value="${this.escapeAttr(this.filters[i] ?? '')}" data-action="col-filter" data-col="${i}" />
                </th>
              `).join('')}
              <th></th>
            </tr>
          </thead>
          <tbody class="${virtual ? 'sheet-virtual-body' : ''}" ${virtual ? `style="--virtual-row-height:${VIRTUAL_ROW_HEIGHT}px"` : ''}>
            ${virtual ? this.renderVirtualRows(pageRows, colSpan) : pageRows.map((row) => this.renderRow(row)).join('')}
          </tbody>
        </table>
      </div>
      ${this.usePagination ? `
        <div class="sheet-pagination">
          <button type="button" class="btn btn-secondary btn-sm" data-action="prev" ${this.page <= 1 ? 'disabled' : ''}>Previous</button>
          <span>Page ${this.page} of ${totalPages}</span>
          <button type="button" class="btn btn-secondary btn-sm" data-action="next" ${this.page >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
      ` : ''}
    `;

    this.bindEvents(virtual, pageRows, colSpan);
  }

  renderVirtualRows(pageRows, colSpan) {
    const wrap = this.container.querySelector?.('.sheet-table-wrap');
    const containerHeight = wrap?.clientHeight ?? 480;
    const rowHeight = VIRTUAL_ROW_HEIGHT;
    const buffer = 8;
    const visibleCount = Math.ceil(containerHeight / rowHeight) + buffer;
    const maxStart = Math.max(0, pageRows.length - visibleCount);
    const startIdx = Math.min(Math.floor(this._scrollTop / rowHeight), maxStart);
    const endIdx = Math.min(startIdx + visibleCount, pageRows.length);
    const topPad = startIdx * rowHeight;
    const bottomPad = Math.max(0, (pageRows.length - endIdx) * rowHeight);
    const visible = pageRows.slice(startIdx, endIdx);

    return `
      <tr class="sheet-virtual-spacer" aria-hidden="true"><td colspan="${colSpan}" style="height:${topPad}px;padding:0;border:none"></td></tr>
      ${visible.map((row) => this.renderRow(row)).join('')}
      <tr class="sheet-virtual-spacer" aria-hidden="true"><td colspan="${colSpan}" style="height:${bottomPad}px;padding:0;border:none"></td></tr>
    `;
  }

  updateVirtualBody(pageRows, colSpan) {
    const tbody = this.container.querySelector('.sheet-virtual-body');
    if (!tbody) return;
    tbody.innerHTML = this.renderVirtualRows(pageRows, colSpan);
  }

  renderRow(row) {
    const invalidClass = !row.valid ? 'row-invalid' : '';
    return `<tr class="${invalidClass}" data-row="${row.index}" style="height:${VIRTUAL_ROW_HEIGHT}px">
      <td class="sheet-row-num">${row.index}</td>
      ${this.headers.map((_, i) => {
        const err = this.highlightErrors && row.cellErrors?.[i];
        return `<td class="${err ? 'cell-invalid' : ''}" title="${err ? this.escapeAttr(err) : ''}">${this.escapeHtml(this.getCellValue(row, i)) || '—'}</td>`;
      }).join('')}
      <td>${row.valid ? '<span class="status-badge pass">OK</span>' : `<span class="status-badge warn" title="${this.escapeAttr(row.issues?.join('; ') ?? '')}">!</span>`}</td>
    </tr>`;
  }

  bindEvents(virtual, pageRows, colSpan) {
    const wrap = this.container.querySelector('.sheet-table-wrap');

    if (virtual && wrap) {
      if (this._scrollHandler) wrap.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = () => {
        this._scrollTop = wrap.scrollTop;
        this.updateVirtualBody(pageRows, colSpan);
      };
      wrap.addEventListener('scroll', this._scrollHandler, { passive: true });
    }

    this.container.querySelector('[data-action="global-filter"]')?.addEventListener('input', (e) => {
      this.globalFilter = e.target.value;
      this.page = 1;
      this._scrollTop = 0;
      this.render();
      this.onChange({ type: 'filter' });
    });

    this.container.querySelectorAll('[data-action="col-filter"]').forEach((el) => {
      el.addEventListener('input', (e) => {
        this.filters[e.target.dataset.col] = e.target.value;
        this.page = 1;
        this._scrollTop = 0;
        this.render();
      });
    });

    this.container.querySelectorAll('[data-action="sort"]').forEach((el) => {
      el.addEventListener('click', () => {
        const col = Number(el.dataset.col);
        if (this.sortCol === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          this.sortCol = col;
          this.sortDir = 'asc';
        }
        this._scrollTop = 0;
        this.render();
      });
    });

    this.container.querySelector('[data-action="page-size"]')?.addEventListener('change', (e) => {
      this.pageSize = Number(e.target.value);
      this.page = 1;
      this._scrollTop = 0;
      this.render();
    });

    this.container.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
      if (this.page > 1) {
        this.page--;
        this._scrollTop = 0;
        this.render();
      }
    });

    this.container.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      const totalPages = Math.ceil(this.filteredRows.length / this.pageSize);
      if (this.page < totalPages) {
        this.page++;
        this._scrollTop = 0;
        this.render();
      }
    });

    this.container.querySelectorAll('[data-action="resize"]').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const col = Number(handle.dataset.col);
        const startX = e.clientX;
        const startW = this.colWidths[col];
        const onMove = (ev) => {
          this.colWidths[col] = Math.max(60, startW + (ev.clientX - startX));
          const th = this.container.querySelector(`th[data-col="${col}"]`);
          if (th) th.style.width = `${this.colWidths[col]}px`;
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  getFilteredRows() {
    this.applyFiltersAndSort();
    return this.filteredRows;
  }

  escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  escapeAttr(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
  }
}
