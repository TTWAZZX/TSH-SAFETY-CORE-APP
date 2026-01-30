// public/js/pages/cccf.js
import { API } from '../api.js';
import { showLoading, hideLoading, showError, showToast } from '../ui.js';
import { normalizeApiArray } from '../utils/normalize.js';

const FALLBACK_IMG =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNlNWU3ZWIiLz48dGV4dCB4PSIxNTAiIHk9IjEwMCIgZmlsbD0iIzY0NzQ4YiIgZm9udC1zaXplPSIxNiIgZm9udC1mYW1pbHk9IkFyaWFsIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7ku6Pku4vku6zlv4M8L3RleHQ+PC9zdmc+';

export async function loadCccfPage() {
  console.log('📸 Loading CCCF Activity...');
  const container = document.getElementById('cccf-page');

  container.innerHTML = `
    <div class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-10 w-10 border-4 border-green-500 border-t-transparent"></div>
    </div>
  `;

  try {
    showLoading();

    // ✅ ใช้ API wrapper (token auto)
    const res = await API.get('/cccf');

    // ✅ รองรับหลายรูปแบบ response
    const activities = Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : [];

    renderCccfGallery(container, activities);

  } catch (err) {
    console.error('CCCF load error:', err);

    container.innerHTML = `
      <div class="p-6 text-center text-red-600">
        ไม่สามารถโหลดข้อมูล CCCF ได้
      </div>
    `;
    showError(err);

  } finally {
    hideLoading();
  }
}

function renderCccfGallery(container, activities = []) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-800">CCCF Activity</h2>
        <p class="text-slate-500 text-sm">
          กิจกรรมค้นหาจุดเสี่ยงและปรับปรุงสภาพแวดล้อม
        </p>
      </div>
      <button id="btn-add-cccf"
        class="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 4v16m8-8H4"/>
        </svg>
        ส่งผลงาน CCCF
      </button>
    </div>

    ${activities.length === 0 ? `
      <div class="text-center text-slate-400 py-16">
        ยังไม่มีข้อมูล CCCF
      </div>
    ` : `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        ${activities.map(item => `
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition">
            <div class="flex h-48">
              <div class="w-1/2 relative border-r">
                <img
                  src="${item.BeforePhoto || FALLBACK_IMG}"
                  onerror="this.src='${FALLBACK_IMG}'"
                  class="w-full h-full object-cover bg-slate-200"
                />
                <span class="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded">
                  BEFORE
                </span>
              </div>
              <div class="w-1/2 relative">
                <img
                  src="${item.AfterPhoto || FALLBACK_IMG}"
                  onerror="this.src='${FALLBACK_IMG}'"
                  class="w-full h-full object-cover bg-slate-200"
                />
                <span class="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded">
                  AFTER
                </span>
              </div>
            </div>

            <div class="p-4">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-slate-800 truncate">
                  ${item.Title || '-'}
                </h3>
                <span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">
                  ${item.Area || '-'}
                </span>
              </div>

              <button
                class="w-full mt-2 px-3 py-1.5 text-sm border rounded hover:bg-slate-50">
                ดูรายละเอียด
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;

  document.getElementById('btn-add-cccf')
    ?.addEventListener('click', () => {
      showToast('ฟอร์ม CCCF กำลังพัฒนา', 'info');
    });
}
