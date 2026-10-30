/**
 * ====================================================================
 * Spare Parts QCM - Inventory & Report Module (js/restock.js)
 * ====================================================================
 * Stock replenishment, FIFO lot management, bulk inventory adjustment,
 * restock history, and analytics report with Excel export.
 */

                         // ===== RESTOCK PRODUCT LOGIC =====
        function initRestockView() {
            document.getElementById('searchRestockProduct').value = '';
            renderRestockTable();
        }

        // ===== Restock Pagination & Bulk Adjustment State =====
        let isBulkAdjusting = false;
        let bulkStockChanges = {};
        let restockCurrentPage = 1;

        function onRestockSearchChange() {
            restockCurrentPage = 1;
            renderRestockTable();
        }

        function changeRestockPage(page) {
            restockCurrentPage = page;
            renderRestockTable();
            const viewSection = document.getElementById('view-restock');
            if (viewSection) {
                viewSection.scrollTop = 0;
            }
        }

        function toggleBulkAdjustMode() {
            isBulkAdjusting = true;
            bulkStockChanges = {};
            const btnBulk = document.getElementById('btnBulkAdjustStock');
            const bulkActions = document.getElementById('bulkAdjustActions');
            const bulkBanner = document.getElementById('bulkAdjustBanner');
            if (btnBulk) btnBulk.classList.add('hidden');
            if (bulkActions) bulkActions.classList.remove('hidden');
            if (bulkBanner) bulkBanner.classList.remove('hidden');
            updateBulkChangeCountBadge();
            renderRestockTable();
        }

        function cancelBulkAdjustMode() {
            isBulkAdjusting = false;
            bulkStockChanges = {};
            const btnBulk = document.getElementById('btnBulkAdjustStock');
            const bulkActions = document.getElementById('bulkAdjustActions');
            const bulkBanner = document.getElementById('bulkAdjustBanner');
            if (btnBulk) btnBulk.classList.remove('hidden');
            if (bulkActions) bulkActions.classList.add('hidden');
            if (bulkBanner) bulkBanner.classList.add('hidden');
            renderRestockTable();
        }

        function onBulkStockInputChange(pId, val) {
            const p = db.products.find(x => x.id == pId);
            if (!p) return;
            const numVal = parseFloat(val);
            const currentStock = parseFloat(p.stock_qty) || 0;
            
            if (!isNaN(numVal) && numVal >= 0 && numVal !== currentStock) {
                bulkStockChanges[pId] = numVal;
            } else {
                delete bulkStockChanges[pId];
            }
            updateBulkChangeCountBadge();
        }

        function updateBulkChangeCountBadge() {
            const badge = document.getElementById('bulkChangeCountBadge');
            if (badge) {
                const count = Object.keys(bulkStockChanges).length;
                badge.innerText = `แก้ไขแล้ว ${count} รายการ`;
                if (count > 0) {
                    badge.className = "px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold text-xs flex-shrink-0 ml-2 shadow-sm animate-pulse";
                } else {
                    badge.className = "px-3 py-1 bg-amber-200 text-amber-900 rounded-lg font-bold text-xs flex-shrink-0 ml-2";
                }
            }
        }

        async function saveBulkAdjustStock() {
            const changedProductIds = Object.keys(bulkStockChanges);
            if (changedProductIds.length === 0) {
                showToast('ไม่มีการเปลี่ยนแปลงจำนวนสต็อก', 'info');
                cancelBulkAdjustMode();
                return;
            }

            const itemsToUpdate = [];
            changedProductIds.forEach(pId => {
                const p = db.products.find(x => x.id == pId);
                if (p) {
                    const newQty = parseFloat(bulkStockChanges[pId]);
                    const currentQty = parseFloat(p.stock_qty) || 0;
                    if (!isNaN(newQty) && newQty >= 0 && newQty !== currentQty) {
                        itemsToUpdate.push({
                            product: p,
                            newQty: newQty,
                            currentQty: currentQty,
                            diff: newQty - currentQty
                        });
                    }
                }
            });

            if (itemsToUpdate.length === 0) {
                showToast('ไม่มีการเปลี่ยนแปลงจำนวนสต็อกที่ถูกต้อง', 'info');
                cancelBulkAdjustMode();
                return;
            }

            const confirmMsg = `ต้องการบันทึกการปรับยอดสต็อกอะไหล่จำนวน ${itemsToUpdate.length} รายการ ใช่หรือไม่?`;
            if (!confirm(confirmMsg)) return;

            const operator = (isLoggedIn && currentUser && currentUser.fullName) ? currentUser.fullName : 'สโตร์';

            showLoading(`กำลังบันทึกการปรับยอดสต็อก (0/${itemsToUpdate.length})...`);

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < itemsToUpdate.length; i++) {
                const item = itemsToUpdate[i];
                showLoading(`กำลังบันทึกการปรับยอดสต็อก (${i + 1}/${itemsToUpdate.length})...`);

                const payload = {
                    id: item.product.id,
                    qty: item.diff,
                    requester: operator,
                    department: "สโตร์ (ปรับสต็อกหลายรายการ)",
                    note: `ปรับยอดสต็อกอะไหล่หลายรายการ (จาก ${item.currentQty} เป็น ${item.newQty})`
                };

                try {
                    let res = await fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'restockProduct', payload: payload })
                    });
                    let result = await res.json();
                    if (result.status === 'success') {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (err) {
                    console.error(err);
                    failCount++;
                }
            }

            hideLoading();

            if (successCount > 0) {
                showToast(`บันทึกการปรับปรุงสต็อกสำเร็จ ${successCount} รายการ ${failCount > 0 ? `(ล้มเหลว ${failCount} รายการ)` : ''}`, failCount > 0 ? 'warning' : 'success');
                await fetchData(true);
            } else {
                showToast('เกิดข้อผิดพลาด ไม่สามารถปรับปรุงสต็อกได้', 'error');
            }

            isBulkAdjusting = false;
            bulkStockChanges = {};
            const btnBulk = document.getElementById('btnBulkAdjustStock');
            const bulkActions = document.getElementById('bulkAdjustActions');
            const bulkBanner = document.getElementById('bulkAdjustBanner');
            if (btnBulk) btnBulk.classList.remove('hidden');
            if (bulkActions) bulkActions.classList.add('hidden');
            if (bulkBanner) bulkBanner.classList.add('hidden');
            renderRestockTable();
        }

        function renderRestockPagination(totalItems, currentPage, totalPages) {
            const infoEl = document.getElementById('restockPaginationInfo');
            const controlsEl = document.getElementById('restockPaginationControls');
            if (!infoEl || !controlsEl) return;

            if (totalItems === 0) {
                infoEl.innerText = "ไม่พบรายการอะไหล่";
                controlsEl.innerHTML = '';
                return;
            }

            const pageSize = 20;
            const startItem = (currentPage - 1) * pageSize + 1;
            const endItem = Math.min(currentPage * pageSize, totalItems);
            infoEl.innerHTML = `แสดง <span class="font-bold text-slate-800">${startItem} - ${endItem}</span> จากทั้งหมด <span class="font-bold text-slate-800">${totalItems}</span> รายการ (หน้า <span class="font-bold text-blue-600">${currentPage}</span> / ${totalPages})`;

            let buttonsHtml = '';

            // First page <<
            buttonsHtml += `
                <button onclick="changeRestockPage(1)" ${currentPage === 1 ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าแรก">
                    <i class="fa-solid fa-angles-left"></i>
                </button>
            `;

            // Prev page <
            buttonsHtml += `
                <button onclick="changeRestockPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าก่อนหน้า">
                    <i class="fa-solid fa-angle-left mr-1"></i> ก่อนหน้า
                </button>
            `;

            // Page numbers
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);

            if (startPage > 1) {
                buttonsHtml += `<button onclick="changeRestockPage(1)" class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition shadow-sm">1</button>`;
                if (startPage > 2) {
                    buttonsHtml += `<span class="px-1 text-gray-400 text-xs font-bold">...</span>`;
                }
            }

            for (let p = startPage; p <= endPage; p++) {
                if (p === currentPage) {
                    buttonsHtml += `<button class="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-500/20 cursor-default">${p}</button>`;
                } else {
                    buttonsHtml += `<button onclick="changeRestockPage(${p})" class="px-3.5 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm">${p}</button>`;
                }
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    buttonsHtml += `<span class="px-1 text-gray-400 text-xs font-bold">...</span>`;
                }
                buttonsHtml += `<button onclick="changeRestockPage(${totalPages})" class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition shadow-sm">${totalPages}</button>`;
            }

            // Next page >
            buttonsHtml += `
                <button onclick="changeRestockPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าถัดไป">
                    ถัดไป <i class="fa-solid fa-angle-right ml-1"></i>
                </button>
            `;

            // Last page >>
            buttonsHtml += `
                <button onclick="changeRestockPage(${totalPages})" ${currentPage === totalPages ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าสุดท้าย">
                    <i class="fa-solid fa-angles-right"></i>
                </button>
            `;

            controlsEl.innerHTML = buttonsHtml;
        }

        function renderRestockTable() {
            const tbody = document.getElementById('restockTableBody');
            if (!tbody) return;
            const searchKeywordString = document.getElementById('searchRestockProduct')?.value.toLowerCase() || '';
            const searchKeywords = searchKeywordString.split(/\s+/).filter(k => k.length > 0);
            tbody.innerHTML = '';

            let filteredProducts = db.products;
            if (searchKeywords.length > 0) {
                filteredProducts = filteredProducts.filter(p => {
                    const textToSearch = `${p.id} ${p.name} ${p.category || ''}`.toLowerCase();
                    return searchKeywords.every(kw => textToSearch.includes(kw));
                });
            }

            const totalItems = filteredProducts.length;
            const pageSize = 20;
            const totalPages = Math.ceil(totalItems / pageSize) || 1;

            if (restockCurrentPage > totalPages) restockCurrentPage = totalPages;
            if (restockCurrentPage < 1) restockCurrentPage = 1;

            renderRestockPagination(totalItems, restockCurrentPage, totalPages);

            if (totalItems === 0) { 
                tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500 font-medium">ไม่พบรายการอะไหล่ที่ค้นหา</td></tr>`; 
                return; 
            }

            const startIndex = (restockCurrentPage - 1) * pageSize;
            const pagedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);

            pagedProducts.forEach((p, index) => {
                const isCancelled = p.note && (p.note.trim() === 'ยกเลิกใช้' || p.note.includes('ยกเลิกใช้'));
                const itemIndex = startIndex + index + 1;

                let stockCellHtml = '';
                if (isBulkAdjusting) {
                    const currentStockVal = (bulkStockChanges[p.id] !== undefined) ? bulkStockChanges[p.id] : (p.stock_qty || 0);
                    const isEdited = (bulkStockChanges[p.id] !== undefined);
                    stockCellHtml = `
                        <div class="flex items-center justify-center">
                            <input type="number" 
                                   min="0" 
                                   step="1"
                                   value="${currentStockVal}" 
                                   oninput="onBulkStockInputChange('${escapeForJS(p.id)}', this.value)"
                                   onchange="onBulkStockInputChange('${escapeForJS(p.id)}', this.value)"
                                   class="w-28 text-center border-2 ${isEdited ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200 font-black' : 'border-blue-400 bg-blue-50/50 text-blue-700 font-bold'} focus:border-blue-600 focus:bg-white rounded-xl py-1.5 px-2 text-base shadow-inner focus:outline-none transition" 
                                   placeholder="0">
                        </div>
                    `;
                } else {
                    const sNum = parseFloat(p.stock_qty) || 0;
                    if (sNum < 0) {
                        stockCellHtml = `<span class="font-extrabold text-red-600 text-base bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-lg inline-flex items-center"><i class="fa-solid fa-triangle-exclamation mr-1 text-xs"></i>${sNum}</span>`;
                    } else {
                        stockCellHtml = `<span class="font-extrabold text-blue-600 text-base">${sNum}</span>`;
                    }
                }

                let tr = `
                    <tr class="hover:bg-blue-50/30 border-b border-gray-200 transition ${isCancelled ? 'bg-red-50/10' : ''} ${bulkStockChanges[p.id] !== undefined ? 'bg-emerald-50/30' : ''}">
                        <td class="p-4 text-center text-gray-500 font-medium">${itemIndex}</td>
                        <td class="p-3"><img src="${escapeHTML(formatImageUrl(p.image_url, 100))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="w-12 h-12 object-cover rounded-lg shadow-sm border border-gray-200 bg-white ${isCancelled ? 'opacity-50 grayscale' : ''}" onerror="handleImgError(this, '${escapeForJS(p.image_url || '')}')"></td>
                        <td class="p-4 font-semibold ${isCancelled ? 'text-gray-400 line-through decoration-red-500' : 'text-gray-800'}">${escapeHTML(p.id)}</td>
                        <td class="p-4 ${isCancelled ? 'text-gray-400 line-through decoration-red-500' : 'text-gray-700'} max-w-xs truncate" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</td>
                        <td class="p-4 text-gray-500">${escapeHTML(p.category || 'ทั่วไป')}</td>
                        <td class="p-4 text-gray-600">${escapeHTML(p.unit || '-')}</td>
                        <td class="p-4 text-center">${stockCellHtml}</td>
                        <td class="p-4 text-center">
                            <div class="flex items-center justify-center gap-2">
                                <button onclick="openAdjustStockModal('${escapeForJS(p.id)}')" ${isBulkAdjusting ? 'disabled class="opacity-40 cursor-not-allowed text-blue-600 bg-blue-50 px-3 py-2 rounded-lg text-xs font-semibold"' : 'class="text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 px-3 py-2 rounded-lg text-xs font-semibold transition shadow-sm inline-flex items-center"'} title="ปรับสต็อก"><i class="fa-solid fa-sliders mr-1"></i> ปรับสต็อก</button>
                                <button onclick="generateQRCodeModal('${escapeForJS(p.id)}')" ${isBulkAdjusting ? 'disabled class="opacity-40 cursor-not-allowed text-sky-600 bg-sky-50 px-3 py-2 rounded-lg text-xs font-semibold"' : 'class="text-sky-600 hover:text-white bg-sky-50 hover:bg-sky-600 px-3 py-2 rounded-lg text-xs font-semibold transition shadow-sm inline-flex items-center"'} title="สร้าง QR Code"><i class="fa-solid fa-qrcode mr-1"></i> QR Code</button>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            });
        }

        function openAdjustStockModal(id) {
            const p = db.products.find(x => x.id == id);
            if (!p) return;
            
            document.getElementById('adj_product_id').value = p.id;
            document.getElementById('adj_current_stock').value = p.stock_qty || 0;
            document.getElementById('adj_prod_title').innerText = `รหัสอะไหล่: ${p.id}`;
            document.getElementById('adj_prod_name').innerText = p.name || '';
            document.getElementById('adj_prod_stock').innerText = p.stock_qty || 0;
            document.getElementById('adj_prod_unit').innerText = p.unit || 'ชิ้น';
            
            document.getElementById('adj_qty').value = '';
            document.getElementById('adj_note').value = '';
            
            // Reset to default mode "add"
            const addRadio = document.querySelector('input[name="adjust_mode"][value="add"]');
            if (addRadio) {
                addRadio.checked = true;
            }
            updateAdjustModeUI();
            
            if (isLoggedIn && currentUser) {
                document.getElementById('adj_operator').value = currentUser.fullName || '';
            } else {
                document.getElementById('adj_operator').value = '';
            }
            
            document.getElementById('adjustStockModal').classList.remove('hidden');
        }

        function closeAdjustStockModal() {
            document.getElementById('adjustStockModal').classList.add('hidden');
        }

        function updateAdjustModeUI() {
            const radios = document.getElementsByName('adjust_mode');
            radios.forEach(radio => {
                const label = radio.parentElement;
                if (radio.checked) {
                    label.classList.remove('border-gray-200');
                    label.classList.add('border-blue-600', 'bg-blue-50/50');
                } else {
                    label.classList.remove('border-blue-600', 'bg-blue-50/50');
                    label.classList.add('border-gray-200');
                }
            });
            updateAdjustPlaceholder();
        }

        function updateAdjustPlaceholder() {
            const mode = document.querySelector('input[name="adjust_mode"]:checked').value;
            const qtyLabel = document.getElementById('adj_qty_label');
            const qtyInput = document.getElementById('adj_qty');
            
            if (mode === 'add') {
                qtyLabel.innerHTML = 'จำนวนที่ต้องการเติม <span class="text-red-500">*</span>';
                qtyInput.placeholder = 'เช่น 10, 50';
                qtyInput.min = '0.01';
            } else if (mode === 'subtract') {
                qtyLabel.innerHTML = 'จำนวนที่ต้องการลด <span class="text-red-500">*</span>';
                qtyInput.placeholder = 'เช่น 5, 20';
                qtyInput.min = '0.01';
            } else if (mode === 'set') {
                qtyLabel.innerHTML = 'กำหนดจำนวนสต็อกใหม่ <span class="text-red-500">*</span>';
                qtyInput.placeholder = 'เช่น 0, 100';
                qtyInput.min = '0';
            }
        }

        async function submitAdjustStock(e) {
            e.preventDefault();
            const productId = document.getElementById('adj_product_id').value;
            const currentStock = parseFloat(document.getElementById('adj_current_stock').value) || 0;
            const mode = document.querySelector('input[name="adjust_mode"]:checked').value;
            const qty = parseFloat(document.getElementById('adj_qty').value);
            const operator = document.getElementById('adj_operator').value.trim();
            const note = document.getElementById('adj_note').value.trim();
            
            if (!productId) return;
            
            if (isNaN(qty) || qty < 0) {
                showToast("กรุณาระบุจำนวนที่ถูกต้อง", "error");
                return;
            }
            
            if (mode === 'add' && qty <= 0) {
                showToast("จำนวนที่เติมต้องมากกว่า 0", "error");
                return;
            }
            if (mode === 'subtract' && qty <= 0) {
                showToast("จำนวนที่ลดต้องมากกว่า 0", "error");
                return;
            }
            
            if (mode === 'subtract' && qty > currentStock) {
                showToast(`ไม่สามารถปรับลดสต็อกมากกว่าจำนวนคงเหลือได้ (สต็อกคงเหลือปัจจุบัน: ${currentStock})`, "error");
                return;
            }
            
            let qtyToSend = 0;
            let transactionNote = "";
            
            if (mode === 'add') {
                qtyToSend = qty;
                transactionNote = note || "เติมสต็อกอะไหล่";
            } else if (mode === 'subtract') {
                qtyToSend = -qty;
                transactionNote = note || "ปรับลดสต็อกอะไหล่";
            } else if (mode === 'set') {
                qtyToSend = qty - currentStock;
                transactionNote = note || `ปรับยอดสต็อกอะไหล่ (จาก ${currentStock} เป็น ${qty})`;
            }
            
            if (qtyToSend === 0) {
                showToast("ไม่มีการเปลี่ยนแปลงจำนวนสต็อก", "info");
                closeAdjustStockModal();
                return;
            }
            
            const payload = {
                id: productId,
                qty: qtyToSend,
                requester: operator,
                department: "สโตร์ (ปรับปรุงสต็อก)",
                note: transactionNote
            };
            
            showLoading('กำลังบันทึกข้อมูลการปรับปรุงสต็อก...');
            try {
                let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'restockProduct', payload: payload }) });
                let result = await res.json();
                if (result.status === 'success') {
                    showToast('ปรับปรุงยอดสต็อกสำเร็จเรียบร้อย');
                    closeAdjustStockModal();
                    await fetchData(true);
                    renderRestockTable();
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อปรับปรุงสต็อกได้', 'error');
            }
            hideLoading();
        }


        // ===== RESTOCK PRODUCT LOGIC =====
        function initRestockView() {
            document.getElementById('formRestockProduct').reset();
            document.getElementById('restock_product_id').value = '';
            document.getElementById('restock_product_detail').classList.add('hidden');
            
            if (isLoggedIn && currentUser) {
                document.getElementById('restock_operator').value = currentUser.fullName || '';
            }
        }

        function openRestockProductSelect() {
            const dropdown = document.getElementById('dropdown_restock_product');
            dropdown.classList.remove('hidden');
            renderRestockProductSelect(true);
        }

        function filterRestockProductSelect() {
            const dropdown = document.getElementById('dropdown_restock_product');
            dropdown.classList.remove('hidden');
            renderRestockProductSelect(false);
        }

        function renderRestockProductSelect(forceShowAll = false) {
            const inputVal = document.getElementById('restock_product_input').value.toLowerCase();
            const keywords = forceShowAll ? [] : inputVal.split(/\s+/).filter(k => k.length > 0);
            const dropdown = document.getElementById('dropdown_restock_product');
            dropdown.innerHTML = '';
            
            let matchCount = 0;
            const displayLimit = 50;
            
            const productsList = [...db.products];
            productsList.sort((a, b) => String(a.name).localeCompare(String(b.name)));
            
            productsList.forEach(p => {
                const textToSearch = `${p.id} ${p.name}`.toLowerCase();
                const isMatch = keywords.every(kw => textToSearch.includes(kw));
                
                if (keywords.length === 0 || isMatch) {
                    if (matchCount < displayLimit) {
                        const stock = p.stock_qty || 0;
                        const unit = p.unit || 'ชิ้น';
                        dropdown.insertAdjacentHTML('beforeend', `
                            <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition flex justify-between items-center text-gray-700" 
                                 onclick="selectRestockProductOption('${escapeForJS(p.id)}', '${escapeForJS(p.name)}', ${stock}, '${escapeForJS(unit)}')">
                                <div>
                                    <span class="font-bold text-blue-700">${escapeHTML(p.id)}</span> - <span>${escapeHTML(p.name)}</span>
                                </div>
                                <span class="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">คงเหลือ ${stock} ${unit}</span>
                            </div>
                        `);
                    }
                    matchCount++;
                }
            });
            
            if (matchCount > displayLimit) {
                dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-2 text-center bg-amber-50 text-xs text-amber-600 font-medium border-t border-amber-100"><i class="fa-solid fa-info-circle mr-1"></i>พบอีก ${matchCount - displayLimit} รายการ — พิมพ์เพิ่มเพื่อค้นหา</div>`);
            }
            if (matchCount === 0 && keywords.length > 0) {
                dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-3 text-gray-400 text-sm text-center">ไม่พบอะไหล่ที่ค้นหา</div>`);
            }
        }

        function selectRestockProductOption(id, name, stock, unit) {
            document.getElementById('restock_product_id').value = id;
            document.getElementById('restock_product_input').value = `${id} - ${name}`;
            document.getElementById('dropdown_restock_product').classList.add('hidden');
            
            document.getElementById('rst_prod_id').innerText = id;
            document.getElementById('rst_prod_name').innerText = name;
            document.getElementById('rst_prod_stock').innerText = `${stock} ${unit}`;
            document.getElementById('restock_product_detail').classList.remove('hidden');
        }

        async function submitRestockProduct(e) {
            e.preventDefault();
            const productId = document.getElementById('restock_product_id').value;
            const qty = parseFloat(document.getElementById('restock_qty').value);
            const operator = document.getElementById('restock_operator').value.trim();
            const note = document.getElementById('restock_note').value.trim();
            
            if (!productId) {
                showToast("กรุณาเลือกอะไหล่ที่ต้องการเติมสต็อก", "error");
                return;
            }
            if (isNaN(qty) || qty <= 0) {
                showToast("จำนวนที่เติมต้องมากกว่า 0", "error");
                return;
            }
            
            const payload = {
                id: productId,
                qty: qty,
                requester: operator,
                department: "สโตร์ (Restock)",
                note: note
            };
            
            showLoading('กำลังบันทึกข้อมูลการเติมสต็อก...');
            try {
                let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'restockProduct', payload: payload }) });
                let result = await res.json();
                if (result.status === 'success') {
                    showToast('เติมสต็อกสำเร็จเรียบร้อย');
                    document.getElementById('formRestockProduct').reset();
                    document.getElementById('restock_product_id').value = '';
                    document.getElementById('restock_product_detail').classList.add('hidden');
                    await fetchData(true);
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อเติมสต็อกได้', 'error');
            }
            hideLoading();
        }


        // ===== Restock & Adjustment Excel Client Logic =====
        function exportRestockToExcel() {
            const searchKeywordString = document.getElementById('searchRestockProduct')?.value.toLowerCase() || '';
            const searchKeywords = searchKeywordString.split(/\s+/).filter(k => k.length > 0);

            let filteredProducts = db.products || [];
            if (searchKeywords.length > 0) {
                filteredProducts = filteredProducts.filter(p => {
                    const textToSearch = `${p.id} ${p.name} ${p.category || ''}`.toLowerCase();
                    return searchKeywords.every(kw => textToSearch.includes(kw));
                });
            }

            if (!filteredProducts || filteredProducts.length === 0) {
                showToast('ไม่มีข้อมูลสำหรับส่งออก', 'error');
                return;
            }

            let csvContent = "\uFEFF"; // UTF-8 BOM
            csvContent += "ลำดับ,รหัสสินค้า,ชื่อสินค้า,หมวดหมู่,หน่วยนับ,สต็อกปัจจุบัน\r\n";

            filteredProducts.forEach((p, index) => {
                let productId = `="${String(p.id).replace(/"/g, '""')}"`;
                let productName = String(p.name || '').replace(/"/g, '""');
                let category = String(p.category || 'ทั่วไป').replace(/"/g, '""');
                let unit = String(p.unit || '-').replace(/"/g, '""');
                let stockQty = p.stock_qty || 0;

                if (productName.includes(',') || productName.includes('\n')) productName = `"${productName}"`;
                if (category.includes(',') || category.includes('\n')) category = `"${category}"`;
                if (unit.includes(',') || unit.includes('\n')) unit = `"${unit}"`;

                csvContent += `${index + 1},${productId},${productName},${category},${unit},${stockQty}\r\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);

            const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
            link.setAttribute("download", `รายการอะไหล่และยอดคงเหลือ_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('ส่งออกไฟล์ Excel (CSV) เรียบร้อยแล้ว', 'success');
        }

        async function initRestockHistoryView() {
            showLoading('กำลังโหลดประวัติการปรับปรุงสต็อก...');
            try {
                let transRes = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getTransactions' }) });
                let result = await transRes.json();
                if (result.status === 'success') {
                    transactions = result.data || [];
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถดึงข้อมูลประวัติจากเซิร์ฟเวอร์ได้', 'error');
            }
            
            document.getElementById('restock_history_search').value = '';
            renderRestockHistoryTable();
            hideLoading();
        }

        function renderRestockHistoryTable() {
            const tbody = document.getElementById('restockHistoryTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            const searchKeyword = document.getElementById('restock_history_search').value.toLowerCase();
            const keywords = searchKeyword.split(/\s+/).filter(k => k.length > 0);
            
            let restockTxs = transactions.filter(t => t.status === 'Restock');
            
            let historyList = [];
            restockTxs.forEach(t => {
                if (t.items && t.items.length > 0) {
                    const item = t.items[0];
                    const prod = db.products.find(p => p.id == item.product_id);
                    const prodName = prod ? prod.name : 'ไม่พบข้อมูลสินค้า';
                    const unit = prod ? prod.unit : 'ชิ้น';
                    
                    historyList.push({
                        productId: item.product_id,
                        productName: prodName,
                        qty: item.qty,
                        unit: unit,
                        operator: t.requester,
                        note: t.note,
                        date: t.date
                    });
                }
            });
            
            if (keywords.length > 0) {
                historyList = historyList.filter(h => {
                    const txt = `${h.productId} ${h.productName}`.toLowerCase();
                    return keywords.every(kw => txt.includes(kw));
                });
            }
            
            if (historyList.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-400">ไม่พบประวัติการปรับปรุงสต็อก</td></tr>`;
                return;
            }
            
            historyList.forEach((h, index) => {
                const modeLabel = h.note.includes("ปรับยอดสต็อกอะไหล่ (จาก") ? "กำหนดใหม่ (=)" : (h.qty > 0 ? "เติมสต็อก (+)" : "ปรับลด (-)");
                
                let modeClass = "bg-green-50 text-green-700 border-green-200";
                if (modeLabel === "ปรับลด (-)") {
                    modeClass = "bg-red-50 text-red-700 border-red-200";
                } else if (modeLabel === "กำหนดใหม่ (=)") {
                    modeClass = "bg-blue-50 text-blue-700 border-blue-200";
                }
                
                const absQty = Math.abs(h.qty);
                
                let tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-gray-100 last:border-0">
                        <td class="p-4 text-center text-gray-500">${index + 1}</td>
                        <td class="p-4 font-bold text-gray-900">${escapeHTML(h.productId)}</td>
                        <td class="p-4 text-gray-700 max-w-xs truncate" title="${escapeHTML(h.productName)}">${escapeHTML(h.productName)}</td>
                        <td class="p-4 text-center">
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold border ${modeClass}">
                                ${modeLabel}
                            </span>
                        </td>
                        <td class="p-4 text-center font-extrabold text-blue-600 text-base">${absQty.toLocaleString('th-TH')}</td>
                        <td class="p-4 text-center text-gray-500">${escapeHTML(h.unit)}</td>
                        <td class="p-4 text-gray-700 font-semibold">${escapeHTML(h.operator)}</td>
                        <td class="p-4 text-gray-500 text-xs">${escapeHTML(h.note)}</td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            });
        }

        function exportRestockHistoryToExcel() {
            const table = document.querySelector('#view-restock-history table');
            if (!table) return;
            
            const rows = table.querySelectorAll('tbody tr');
            let csvContent = "\uFEFF"; // UTF-8 BOM
            
            csvContent += "ลำดับ,รหัสสินค้า,ชื่อสินค้า,รูปแบบการปรับปรุงสต็อก,จำนวนที่ปรับปรุง,หน่วย,ผู้ดำเนินการ,หมายเหตุ\r\n";
            
            rows.forEach((row, index) => {
                const cols = row.querySelectorAll('td');
                if (cols.length < 8) return;
                
                const no = cols[0].innerText.trim();
                let productId = cols[1].innerText.trim().replace(/"/g, '""');
                let productName = cols[2].innerText.trim().replace(/"/g, '""');
                let mode = cols[3].innerText.trim().replace(/"/g, '""');
                let qty = cols[4].innerText.trim().replace(/"/g, '""');
                let unit = cols[5].innerText.trim().replace(/"/g, '""');
                let operator = cols[6].innerText.trim().replace(/"/g, '""');
                let note = cols[7].innerText.trim().replace(/"/g, '""');
                
                productId = `="${productId}"`;
                
                if (productName.includes(',') || productName.includes('\n')) productName = `"${productName}"`;
                if (mode.includes(',') || mode.includes('\n')) mode = `"${mode}"`;
                if (unit.includes(',') || unit.includes('\n')) unit = `"${unit}"`;
                if (operator.includes(',') || operator.includes('\n')) operator = `"${operator}"`;
                if (note.includes(',') || note.includes('\n')) note = `"${note}"`;
                
                csvContent += `${no},${productId},${productName},${mode},${qty},${unit},${operator},${note}\r\n`;
            });
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            
            const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
            link.setAttribute("download", `ประวัติการปรับปรุงสต็อก_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('ส่งออกไฟล์ Excel (CSV) เรียบร้อยแล้ว', 'success');
        }


        // ===== Report Pagination State & Helpers =====
        let reportCurrentPage = 1;
        let lastFilteredReportProducts = [];
        let lastReportProductUsageMap = new Map();
        let lastReportProductMachinesMap = new Map();
        let lastReportProductSerialsMap = new Map();
        let lastActiveTransactions = [];

        function changeReportPage(page) {
            reportCurrentPage = page;
            filterReport(false);
        }

        function renderReportPagination(totalItems, currentPage, totalPages) {
            const infoEl = document.getElementById('reportPaginationInfo');
            const controlsEl = document.getElementById('reportPaginationControls');
            const paginationContainer = document.getElementById('reportPagination');
            
            if (!infoEl || !controlsEl || !paginationContainer) return;

            if (totalPages <= 1) {
                paginationContainer.classList.add('hidden');
                return;
            } else {
                paginationContainer.classList.remove('hidden');
            }

            const pageSize = 20;
            const startItem = (currentPage - 1) * pageSize + 1;
            const endItem = Math.min(currentPage * pageSize, totalItems);
            infoEl.innerHTML = `แสดง <span class="font-bold text-slate-800">${startItem} - ${endItem}</span> จากทั้งหมด <span class="font-bold text-slate-800">${totalItems}</span> รายการ (หน้า <span class="font-bold text-blue-600">${currentPage}</span> / ${totalPages})`;

            let buttonsHtml = '';

            // First page <<
            buttonsHtml += `
                <button onclick="changeReportPage(1)" ${currentPage === 1 ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าแรก">
                    <i class="fa-solid fa-angles-left"></i>
                </button>
            `;

            // Prev page <
            buttonsHtml += `
                <button onclick="changeReportPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าก่อนหน้า">
                    <i class="fa-solid fa-angle-left mr-1"></i> ก่อนหน้า
                </button>
            `;

            // Page numbers
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);

            if (startPage > 1) {
                buttonsHtml += `<button onclick="changeReportPage(1)" class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition shadow-sm">1</button>`;
                if (startPage > 2) {
                    buttonsHtml += `<span class="px-1 text-gray-400 text-xs font-bold">...</span>`;
                }
            }

            for (let p = startPage; p <= endPage; p++) {
                if (p === currentPage) {
                    buttonsHtml += `<button class="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-extrabold shadow-md shadow-blue-500/20 cursor-default">${p}</button>`;
                } else {
                    buttonsHtml += `<button onclick="changeReportPage(${p})" class="px-3.5 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm">${p}</button>`;
                }
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    buttonsHtml += `<span class="px-1 text-gray-400 text-xs font-bold">...</span>`;
                }
                buttonsHtml += `<button onclick="changeReportPage(${totalPages})" class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition shadow-sm">${totalPages}</button>`;
            }

            // Next page >
            buttonsHtml += `
                <button onclick="changeReportPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าถัดไป">
                    ถัดไป <i class="fa-solid fa-angle-right ml-1"></i>
                </button>
            `;

            // Last page >>
            buttonsHtml += `
                <button onclick="changeReportPage(${totalPages})" ${currentPage === totalPages ? 'disabled class="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold cursor-not-allowed border border-gray-200"' : 'class="px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95 shadow-sm"'} title="หน้าสุดท้าย">
                    <i class="fa-solid fa-angles-right"></i>
                </button>
            `;

            controlsEl.innerHTML = buttonsHtml;
        }

        // ===== Report Analytics Client Logic =====
        async function initReportView() {
            showLoading('กำลังโหลดข้อมูลรายงาน...');
            try {
                let transRes = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getTransactions' }) });
                let result = await transRes.json();
                if (result.status === 'success') {
                    transactions = result.data || [];
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถดึงข้อมูลประวัติการเบิกจ่ายมาทำรายงานได้', 'error');
            }
            
            buildReportFilterOptions();
            filterReport();
            hideLoading();
        }

        function buildReportFilterOptions() {
            // 1. Category Options
            const cats = [...new Set(db.products.map(p => p.category))].filter(c => c && c.trim() !== '').sort();
            window.reportCategories = cats;

            // 2. Machine Options
            const machs = db.machines.sort((a,b) => String(a.id).localeCompare(String(b.id)));
            window.reportMachines = machs;

            // 3. Requester Options
            const reqs = [...new Set(transactions.map(t => t.requester))].filter(r => r && r.trim() !== '').sort();
            window.reportRequesters = reqs;

            // 4. Year Options (Buddhist Era / BE)
            const yearSelect = document.getElementById('report_filter_year');
            const years = [...new Set(transactions.map(t => {
                if (t.date && t.date.length >= 4) {
                    const yr = parseInt(t.date.substring(0, 4));
                    if (!isNaN(yr)) return yr + 543;
                }
                return null;
            }))].filter(y => y !== null).sort((a, b) => b - a);

            yearSelect.innerHTML = '<option value="all">-- ทุกปี --</option>';
            years.forEach(y => {
                yearSelect.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
            });
        }

        function openReportSelect(type) {
            const dropdown = document.getElementById(`report_filter_${type}_dropdown`);
            dropdown.classList.remove('hidden');
            renderReportSelectOptions(type, true);
        }

        function filterReportSelect(type) {
            const dropdown = document.getElementById(`report_filter_${type}_dropdown`);
            dropdown.classList.remove('hidden');
            renderReportSelectOptions(type, false);
        }

        function renderReportSelectOptions(type, forceShowAll = false) {
            const input = document.getElementById(`report_filter_${type}_input`);
            const dropdown = document.getElementById(`report_filter_${type}_dropdown`);
            const val = forceShowAll ? '' : input.value.toLowerCase();
            const keywords = val.split(/\s+/).filter(k => k.length > 0);
            dropdown.innerHTML = '';

            let allText = '-- ทั้งหมด --';
            if (type === 'cat') allText = '-- ทุกหมวดหมู่อะไหล่ --';
            else if (type === 'mach') allText = '-- ทุกเครื่องจักร --';
            else if (type === 'req') allText = '-- ทุกคน --';
            else if (type === 'doc') allText = '-- ทุกเอกสาร --';

            dropdown.insertAdjacentHTML('beforeend', `
                <div class="px-4 py-2.5 hover:bg-slate-100 cursor-pointer border-b border-gray-100 font-bold bg-slate-50 text-gray-800" 
                     onclick="selectReportOption('${type}', 'all', '')">
                    ${allText}
                </div>
            `);

            let matchCount = 0;
            if (type === 'cat') {
                const cats = window.reportCategories || [];
                cats.forEach(c => {
                    if (keywords.length === 0 || keywords.every(k => c.toLowerCase().includes(k))) {
                        dropdown.insertAdjacentHTML('beforeend', `
                            <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-700" 
                                 onclick="selectReportOption('cat', '${escapeForJS(c)}', '${escapeForJS(c)}')">
                                ${escapeHTML(c)}
                            </div>
                        `);
                        matchCount++;
                    }
                });
            } else if (type === 'mach') {
                const machs = window.reportMachines || [];
                machs.forEach(m => {
                    const txt = `${m.id} ${m.name}`.toLowerCase();
                    if (keywords.length === 0 || keywords.every(k => txt.includes(k))) {
                        dropdown.insertAdjacentHTML('beforeend', `
                            <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-700" 
                                 onclick="selectReportOption('mach', '${escapeForJS(m.id)}', '${escapeForJS(m.id)} : ${escapeForJS(m.name)}')">
                                <span class="font-bold text-blue-700">${escapeHTML(m.id)}</span> : <span>${escapeHTML(m.name)}</span>
                            </div>
                        `);
                        matchCount++;
                    }
                });
            } else if (type === 'req') {
                const reqs = window.reportRequesters || [];
                reqs.forEach(r => {
                    if (keywords.length === 0 || keywords.every(k => r.toLowerCase().includes(k))) {
                        dropdown.insertAdjacentHTML('beforeend', `
                            <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-700" 
                                 onclick="selectReportOption('req', '${escapeForJS(r)}', '${escapeForJS(r)}')">
                                ${escapeHTML(r)}
                            </div>
                        `);
                        matchCount++;
                    }
                });
            } else if (type === 'doc') {
                const docs = getActiveDocumentIds();
                docs.forEach(d => {
                    if (keywords.length === 0 || keywords.every(k => d.toLowerCase().includes(k))) {
                        dropdown.insertAdjacentHTML('beforeend', `
                            <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-700 font-mono" 
                                 onclick="selectReportOption('doc', '${escapeForJS(d)}', '${escapeForJS(d)}')">
                                ${escapeHTML(d)}
                            </div>
                        `);
                        matchCount++;
                    }
                });
            }

            if (matchCount === 0 && keywords.length > 0) {
                dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-3 text-gray-400 text-center">ไม่พบข้อมูลที่ค้นหา</div>`);
            }
        }

        function getActiveDocumentIds() {
            const selectedMach = document.getElementById('report_filter_mach').value;
            const selectedReq = document.getElementById('report_filter_req').value;
            const selectedMonth = document.getElementById('report_filter_month').value;
            const selectedYear = document.getElementById('report_filter_year').value;
            const startDate = document.getElementById('report_filter_start_date').value;
            const endDate = document.getElementById('report_filter_end_date').value;

            let activeTx = transactions.filter(t => {
                if (t.status === 'Cancelled' || t.status === 'Restock') return false;
                if (selectedReq !== 'all' && t.requester !== selectedReq) return false;
                if (selectedMach !== 'all' && String(t.machine_id) !== String(selectedMach)) return false;
                
                if (t.date && t.date.length >= 10) {
                     const tDateOnly = t.date.substring(0, 10);
                     if (startDate && tDateOnly < startDate) return false;
                     if (endDate && tDateOnly > endDate) return false;
                     
                     if (selectedMonth !== 'all') {
                         const tMonth = t.date.substring(5, 7);
                         if (tMonth !== selectedMonth) return false;
                     }
                     
                     if (selectedYear !== 'all') {
                         const tYearAD = parseInt(t.date.substring(0, 4));
                         const tYearBE = tYearAD + 543;
                         if (String(tYearBE) !== String(selectedYear)) return false;
                     }
                }
                return true;
            });

            return [...new Set(activeTx.map(t => t.id))].sort((a, b) => b.localeCompare(a));
        }

        function selectReportOption(type, value, displayLabel) {
            document.getElementById(`report_filter_${type}`).value = value;
            document.getElementById(`report_filter_${type}_input`).value = displayLabel || '';
            document.getElementById(`report_filter_${type}_dropdown`).classList.add('hidden');
            filterReport();
        }

        function filterReport(resetPage = true) {
            if (resetPage) {
                reportCurrentPage = 1;
            }
            const selectedMach = document.getElementById('report_filter_mach').value;
            const selectedReq = document.getElementById('report_filter_req').value;
            const selectedMonth = document.getElementById('report_filter_month').value;
            const selectedYear = document.getElementById('report_filter_year').value;
            const startDate = document.getElementById('report_filter_start_date').value;
            const endDate = document.getElementById('report_filter_end_date').value;
            const selectedDoc = document.getElementById('report_filter_doc').value;

            let activeTx = transactions.filter(t => {
                if (t.status === 'Cancelled' || t.status === 'Restock') return false;
                if (selectedReq !== 'all' && t.requester !== selectedReq) return false;
                if (selectedMach !== 'all' && String(t.machine_id) !== String(selectedMach)) return false;
                if (selectedDoc !== 'all' && t.id !== selectedDoc) return false;
                
                if (t.date && t.date.length >= 10) {
                     const tDateOnly = t.date.substring(0, 10);
                     if (startDate && tDateOnly < startDate) return false;
                     if (endDate && tDateOnly > endDate) return false;
                     
                     if (selectedMonth !== 'all') {
                          const tMonth = t.date.substring(5, 7);
                          if (tMonth !== selectedMonth) return false;
                     }
                     
                     if (selectedYear !== 'all') {
                          const tYearAD = parseInt(t.date.substring(0, 4));
                          const tYearBE = tYearAD + 543;
                          if (String(tYearBE) !== String(selectedYear)) return false;
                     }
                }
                return true;
            });

            const productUsageMap = new Map();
            const productMachinesMap = new Map();
            const productSerialsMap = new Map();

            activeTx.forEach(t => {
                if (t.items && Array.isArray(t.items)) {
                    const machObj = t.machine_id ? (db.machines || []).find(m => String(m.id).trim() === String(t.machine_id).trim()) : null;
                    const machName = machObj ? (machObj.name || machObj.id) : (t.machine_model || t.machine_id || '');
                    const sn = String(t.serial_number || '').trim();

                    t.items.forEach(item => {
                        const pId = String(item.product_id).trim();
                        const currentQty = productUsageMap.get(pId) || 0;
                        productUsageMap.set(pId, currentQty + parseFloat(item.qty || 0));

                        if (machName) {
                            if (!productMachinesMap.has(pId)) productMachinesMap.set(pId, new Set());
                            productMachinesMap.get(pId).add(machName);
                        }
                        if (sn) {
                            if (!productSerialsMap.has(pId)) productSerialsMap.set(pId, new Set());
                            productSerialsMap.get(pId).add(sn);
                        }
                    });
                }
            });

            let productsToRender = db.products;
            const selectedCat = document.getElementById('report_filter_cat').value;
            if (selectedCat !== 'all') {
                productsToRender = productsToRender.filter(p => p.category === selectedCat);
            }

            const searchVal = document.getElementById('report_search_input').value.toLowerCase();
            const searchKeywords = searchVal.split(/\s+/).filter(k => k.length > 0);
            if (searchKeywords.length > 0) {
                productsToRender = productsToRender.filter(p => {
                    const pIdStr = String(p.id).trim();
                    const machSet = productMachinesMap.get(pIdStr) || new Set();
                    const snSet = productSerialsMap.get(pIdStr) || new Set();
                    const machText = Array.from(machSet).join(' ');
                    const snText = Array.from(snSet).join(' ');
                    const txt = `${p.id} ${p.name} ${machText} ${snText}`.toLowerCase();
                    return searchKeywords.every(k => txt.includes(k));
                });
            }

            // Filter to show only items that have actually been withdrawn (qty > 0)
            productsToRender = productsToRender.filter(p => {
                const qty = productUsageMap.get(String(p.id)) || 0;
                return qty > 0;
            });

            // Save for exporting to Excel
            lastFilteredReportProducts = productsToRender;
            lastReportProductUsageMap = productUsageMap;
            lastReportProductMachinesMap = productMachinesMap;
            lastReportProductSerialsMap = productSerialsMap;
            lastActiveTransactions = activeTx;

            let totalQtySum = 0;
            let totalCostSum = 0;
            let totalMidSum = 0;

            productsToRender.forEach((p) => {
                const qty = productUsageMap.get(String(p.id)) || 0;
                const cost = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                const priceA = parseFloat(String(p.price_a).replace(/,/g, '')) || 0;

                totalQtySum += qty;
                totalCostSum += qty * cost;
                totalMidSum += qty * priceA;
            });

            const totalItems = productsToRender.length;
            const pageSize = 20;
            const totalPages = Math.ceil(totalItems / pageSize) || 1;

            if (reportCurrentPage > totalPages) reportCurrentPage = totalPages;
            if (reportCurrentPage < 1) reportCurrentPage = 1;

            renderReportPagination(totalItems, reportCurrentPage, totalPages);

            let html = '';
            if (totalItems > 0) {
                const startIndex = (reportCurrentPage - 1) * pageSize;
                const pagedProducts = productsToRender.slice(startIndex, startIndex + pageSize);

                pagedProducts.forEach((p, index) => {
                    const qty = productUsageMap.get(String(p.id)) || 0;
                    const cost = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                    const priceA = parseFloat(String(p.price_a).replace(/,/g, '')) || 0;
                    const priceB = parseFloat(String(p.price_b).replace(/,/g, '')) || 0;
                    const priceC = parseFloat(String(p.price_c).replace(/,/g, '')) || 0;

                    const itemIndex = startIndex + index + 1;

                    const pIdStr = String(p.id).trim();
                    const machSet = productMachinesMap.get(pIdStr) || new Set();
                    const machDisplay = Array.from(machSet).join(', ') || '-';

                    const snSet = productSerialsMap.get(pIdStr) || new Set();
                    const snDisplay = Array.from(snSet).join(', ') || '-';

                    html += `
                        <tr class="hover:bg-slate-50 transition border-b border-gray-100 last:border-0">
                            <td class="p-4 text-center text-gray-500">${itemIndex}</td>
                            <td class="p-4 font-bold text-gray-900">${escapeHTML(p.id)}</td>
                            <td class="p-4 text-gray-700 max-w-xs truncate" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</td>
                            <td class="p-4 text-gray-700 max-w-xs truncate font-medium" title="${escapeHTML(machDisplay)}">${escapeHTML(machDisplay)}</td>
                            <td class="p-4 text-gray-600 font-mono text-xs max-w-xs truncate" title="${escapeHTML(snDisplay)}">${escapeHTML(snDisplay)}</td>
                            <td class="p-4 text-center font-extrabold text-blue-600 text-base">${qty.toLocaleString('th-TH')}</td>
                            <td class="p-4 text-right text-gray-600">฿${cost.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td class="p-4 text-right text-emerald-600 font-semibold">฿${priceA.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td class="p-4 text-right text-gray-600">฿${priceB.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                            <td class="p-4 text-right text-gray-600">฿${priceC.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                    `;
                });
            }

            if (totalItems === 0) {
                document.getElementById('reportTableBody').innerHTML = `<tr><td colspan="10" class="p-10 text-center text-gray-400">ไม่พบข้อมูลการใช้งานอะไหล่</td></tr>`;
            } else {
                document.getElementById('reportTableBody').innerHTML = html;
            }

            document.getElementById('report_stat_total_items').innerText = `${totalItems.toLocaleString('th-TH')} รายการ`;
            document.getElementById('report_stat_total_qty').innerText = `${totalQtySum.toLocaleString('th-TH')} ชิ้น`;
            document.getElementById('report_stat_total_cost').innerText = `฿${totalCostSum.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            document.getElementById('report_stat_total_mid').innerText = `฿${totalMidSum.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        function clearReportFilters() {
            document.getElementById('report_search_input').value = '';
            document.getElementById('report_filter_cat').value = 'all';
            document.getElementById('report_filter_cat_input').value = '';
            document.getElementById('report_filter_mach').value = 'all';
            document.getElementById('report_filter_mach_input').value = '';
            document.getElementById('report_filter_req').value = 'all';
            document.getElementById('report_filter_req_input').value = '';
            document.getElementById('report_filter_doc').value = 'all';
            document.getElementById('report_filter_doc_input').value = '';
            document.getElementById('report_filter_month').value = 'all';
            document.getElementById('report_filter_year').value = 'all';
            document.getElementById('report_filter_start_date').value = '';
            document.getElementById('report_filter_end_date').value = '';
            filterReport();
        }

        // ส่งออกรายงานแบบละเอียด (กางรายชิ้น / แยกแถวตามวัน-เวลา, เครื่องจักร, S/N เดี่ยว)
        function exportReportDetailedToExcel() {
            if (!lastActiveTransactions || lastActiveTransactions.length === 0) {
                showToast('ไม่มีข้อมูลสำหรับส่งออก', 'warning');
                return;
            }

            const allowedProductIds = new Set((lastFilteredReportProducts || []).map(p => String(p.id).trim()));
            const prodMap = new Map();
            (db.products || []).forEach(p => {
                prodMap.set(String(p.id).trim(), p);
            });
            const machMap = new Map();
            (db.machines || []).forEach(m => {
                machMap.set(String(m.id).trim(), m);
            });

            let csvContent = "\uFEFF"; // UTF-8 BOM

            const headers = [
                'ลำดับ',
                'วันที่',
                'เวลา',
                'เลขที่ใบเบิก',
                'ผู้ขอเบิก',
                'แผนก',
                'รหัสสินค้า',
                'ชื่อสินค้า',
                'หมวดหมู่',
                'เครื่องจักร',
                'Serial Number',
                'จำนวนที่เบิก',
                'หน่วยนับ',
                'ราคาต้นทุน',
                'ราคา (กลาง)',
                'ราคา (ตัวแทน)',
                'ราคา (ในเครือ)',
                'รวมมูลค่า (กลาง)',
                'หมายเหตุ'
            ];

            const formattedHeaders = headers.map(h => {
                if (h.includes(',') || h.includes('\n') || h.includes('"')) {
                    return `"${h.replace(/"/g, '""')}"`;
                }
                return h;
            });
            csvContent += formattedHeaders.join(',') + "\r\n";

            let rowCount = 0;

            lastActiveTransactions.forEach(t => {
                if (t.status === 'Cancelled' || t.status === 'Restock') return;

                const dateStr = String(t.date || '').trim();
                const datePart = dateStr.length >= 10 ? dateStr.substring(0, 10) : (dateStr || '-');
                const timePart = dateStr.length >= 19 ? dateStr.substring(11, 19) : (dateStr.split(' ')[1] || '-');

                const mId = String(t.machine_id || '').trim();
                const machObj = mId ? machMap.get(mId) : null;
                const machDisplay = machObj ? (machObj.name || machObj.id) : (t.machine_model || mId || '-');

                const rawSn = String(t.serial_number || '').trim();
                const snDisplay = rawSn ? rawSn : '-';
                const formattedSn = (snDisplay === '-' || !snDisplay) ? '-' : `="${snDisplay.replace(/"/g, '""')}"`;

                const reqName = String(t.requester || '-').trim();
                const deptName = String(t.department || '-').trim();
                const txDocId = String(t.id || '-').trim();
                const txNote = String(t.note || '').trim();

                const txItems = typeof groupTransactionItems === 'function' ? groupTransactionItems(t.items) : (t.items || []);
                txItems.forEach(item => {
                    const pIdStr = String(item.product_id).trim();
                    if (allowedProductIds.size > 0 && !allowedProductIds.has(pIdStr)) {
                        return;
                    }

                    rowCount++;
                    const product = prodMap.get(pIdStr);
                    const pName = product ? String(product.name || '').trim() : String(item.name || pIdStr).trim();
                    const pCat = product ? String(product.category || 'ทั่วไป').trim() : 'ทั่วไป';
                    const pUnit = product ? String(product.unit || 'ชิ้น').trim() : 'ชิ้น';

                    const qty = parseFloat(item.qty || 0);
                    const cost = product ? (parseFloat(String(product.cost).replace(/,/g, '')) || 0) : (parseFloat(item.unit_cost || 0));
                    const priceA = product ? (parseFloat(String(product.price_a).replace(/,/g, '')) || 0) : (parseFloat(item.price || 0));
                    const priceB = product ? (parseFloat(String(product.price_b).replace(/,/g, '')) || 0) : 0;
                    const priceC = product ? (parseFloat(String(product.price_c).replace(/,/g, '')) || 0) : 0;
                    const subtotalA = qty * priceA;

                    const rowData = [
                        String(rowCount),
                        datePart,
                        timePart,
                        `="${txDocId}"`,
                        reqName,
                        deptName,
                        `="${pIdStr}"`,
                        pName,
                        pCat,
                        machDisplay,
                        formattedSn,
                        qty.toLocaleString('th-TH'),
                        pUnit,
                        `฿${cost.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                        `฿${priceA.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                        `฿${priceB.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                        `฿${priceC.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                        `฿${subtotalA.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                        txNote || '-'
                    ];

                    const formattedRow = rowData.map(val => {
                        let text = String(val).trim().replace(/"/g, '""');
                        if (text.includes(',') || text.includes('\n') || text.includes('"')) {
                            text = `"${text}"`;
                        }
                        return text;
                    });

                    csvContent += formattedRow.join(',') + "\r\n";
                });
            });

            if (rowCount === 0) {
                showToast('ไม่มีรายการเบิกอะไหล่ที่ตรงกับเงื่อนไข', 'warning');
                return;
            }

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);

            const startDate = document.getElementById('report_filter_start_date')?.value;
            const endDate = document.getElementById('report_filter_end_date')?.value;
            let fileDateLabel = '';
            if (startDate && endDate) {
                fileDateLabel = `_${startDate}_ถึง_${endDate}`;
            } else if (startDate) {
                fileDateLabel = `_ตั้งแต่_${startDate}`;
            } else {
                const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
                fileDateLabel = `_${dateStr}`;
            }

            link.setAttribute("download", `รายงานการเบิกใช้อะไหล่_รายรายการ${fileDateLabel}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast(`ส่งออกรายการเบิกแบบละเอียด (${rowCount} รายการ) เรียบร้อยแล้ว`, 'success');
        }

        // ส่งออกรายงานแบบสรุปสะสมตามชนิดอะไหล่
        function exportReportSummaryToExcel() {
            if (!lastFilteredReportProducts || lastFilteredReportProducts.length === 0) {
                showToast('ไม่มีข้อมูลสำหรับส่งออก', 'warning');
                return;
            }
            
            let csvContent = "\uFEFF";
            
            const headers = ['รหัสสินค้า', 'ชื่อสินค้า', 'จำนวนที่เบิกรวม', 'ราคาต้นทุน', 'ราคา (กลาง)', 'ราคา (ตัวแทน)', 'ราคา (ในเครือ)'];
            const formattedHeaders = headers.map(h => {
                if (h.includes(',') || h.includes('\n') || h.includes('"')) {
                    return `"${h.replace(/"/g, '""')}"`;
                }
                return h;
            });
            csvContent += formattedHeaders.join(',') + "\r\n";
            
            lastFilteredReportProducts.forEach((p) => {
                const pIdStr = String(p.id).trim();
                const qty = lastReportProductUsageMap.get(pIdStr) || 0;
                const cost = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                const priceA = parseFloat(String(p.price_a).replace(/,/g, '')) || 0;
                const priceB = parseFloat(String(p.price_b).replace(/,/g, '')) || 0;
                const priceC = parseFloat(String(p.price_c).replace(/,/g, '')) || 0;

                const rowData = [
                    `="${p.id}"`,
                    p.name,
                    qty.toLocaleString('th-TH'),
                    `฿${cost.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    `฿${priceA.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    `฿${priceB.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                    `฿${priceC.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                ];
                
                const formattedRow = rowData.map(val => {
                    let text = String(val).trim().replace(/"/g, '""');
                    if (text.includes(',') || text.includes('\n') || text.includes('"')) {
                        text = `"${text}"`;
                    }
                    return text;
                });
                
                csvContent += formattedRow.join(',') + "\r\n";
            });
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            
            const startDate = document.getElementById('report_filter_start_date')?.value;
            const endDate = document.getElementById('report_filter_end_date')?.value;
            let fileDateLabel = '';
            if (startDate && endDate) {
                fileDateLabel = `_${startDate}_ถึง_${endDate}`;
            } else if (startDate) {
                fileDateLabel = `_ตั้งแต่_${startDate}`;
            } else {
                const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
                fileDateLabel = `_${dateStr}`;
            }
            link.setAttribute("download", `รายงานสรุปยอดเบิกตามอะไหล่${fileDateLabel}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('ส่งออกไฟล์สรุปยอดเบิก (CSV) เรียบร้อยแล้ว', 'success');
        }

        // ตัวเลือกการส่งออก Excel พร้อมหน้าต่าง SweetAlert ให้เลือก
        function exportReportToExcel(mode = null) {
            if (mode === 'detailed') {
                exportReportDetailedToExcel();
                return;
            }
            if (mode === 'summary') {
                exportReportSummaryToExcel();
                return;
            }

            Swal.fire({
                title: '<i class="fa-solid fa-file-excel text-emerald-600 mr-2"></i>เลือกรูปแบบการส่งออก Excel',
                html: `
                    <div class="text-left text-xs space-y-3 mt-2 text-gray-600">
                        <p>กรุณาเลือกรูปแบบรายงานการเบิกใช้อะไหล่ที่ต้องการ:</p>
                        <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                            <p class="font-bold text-emerald-800 text-xs flex items-center gap-1.5 mb-1">
                                <i class="fa-solid fa-list-check text-emerald-600"></i> รายการเบิกแบบละเอียด (กางรายชิ้น) [แนะนำ]
                            </p>
                            <p class="text-[11px] text-emerald-700">กางแยกรายแถว ระบุวันที่-เวลา, เลขที่ใบเบิก, ผู้ขอเบิก, เครื่องจักร และ Serial Number ชัดเจนในแต่ละชิ้น</p>
                        </div>
                        <div class="p-3 bg-blue-50 rounded-xl border border-blue-200">
                            <p class="font-bold text-blue-800 text-xs flex items-center gap-1.5 mb-1">
                                <i class="fa-solid fa-chart-pie text-blue-600"></i> สรุปยอดรวมสะสมตามอะไหล่
                            </p>
                            <p class="text-[11px] text-blue-700">แสดงสรุป 1 แถวต่อ 1 ชนิดอะไหล่ พร้อมยอดรวมจำนวนที่เบิกทั้งหมด</p>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-list-check mr-1.5"></i>ส่งออกรายการเบิกแบบละเอียด',
                confirmButtonColor: '#059669',
                denyButtonText: '<i class="fa-solid fa-chart-pie mr-1.5"></i>ส่งออกสรุปยอดรวมตามอะไหล่',
                denyButtonColor: '#2563eb',
                showDenyButton: true,
                cancelButtonText: 'ยกเลิก',
                cancelButtonColor: '#6b7280',
                reverseButtons: false,
                customClass: {
                    popup: 'rounded-2xl',
                    confirmButton: 'rounded-xl font-semibold !text-xs !py-2.5 !px-3',
                    denyButton: 'rounded-xl font-semibold !text-xs !py-2.5 !px-3',
                    cancelButton: 'rounded-xl font-semibold !text-xs'
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    exportReportDetailedToExcel();
                } else if (result.isDenied) {
                    exportReportSummaryToExcel();
                }
            });
        }

        // ================== ระบบอัปเดตสต็อกจาก ERP ==================
        let erpPreviewState = {
            matchedToUpdate: [],
            matchedUnchanged: [],
            notFoundInSystem: [],
            fileName: '',
            activeTab: 'update'
        };

        window.triggerErpStockUpload = function() {
            if (!isLoggedIn || !currentUser) {
                showToast('กรุณาเข้าสู่ระบบก่อนดำเนินการ', 'warning');
                return;
            }
            const canSync = currentUser.role === 'ADMIN' || currentUser.role === 'Manager' || currentUser.role === 'StoreOfficer' || hasAccess('view-restock');
            if (!canSync) {
                showToast('คุณไม่มีสิทธิ์ในการอัปเดตสต็อก', 'error');
                return;
            }
            const input = document.getElementById('erpStockFileInput');
            if (input) input.click();
        };

        window.handleErpStockFileSelected = function(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            event.target.value = '';

            showLoading('กำลังอ่านและวิเคราะห์ไฟล์สต็อก ERP...');

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                    if (!rows || rows.length === 0) {
                        hideLoading();
                        Swal.fire({
                            icon: 'error',
                            title: 'ไฟล์ว่างเปล่า',
                            text: 'ไม่พบข้อมูลในไฟล์ที่เลือก กรุณาตรวจสอบไฟล์อีกครั้ง',
                            customClass: { popup: 'rounded-2xl' }
                        });
                        return;
                    }

                    const firstRow = rows[0];
                    const keys = Object.keys(firstRow);

                    const idKey = keys.find(k => {
                        const c = k.trim().toLowerCase();
                        return c === 'รหัสสินค้า' || c === 'รหัส' || c === 'item code' || c === 'product id' || c === 'item_code' || c === 'product_id' || c === 'code';
                    });

                    const onHandKey = keys.find(k => {
                        const c = k.trim().toLowerCase();
                        return c === 'on hand' || c === 'onhand' || c === 'available' || c === 'ยอดคงเหลือ' || c === 'จำนวน' || c === 'stock' || c === 'stock_qty';
                    });

                    const nameKey = keys.find(k => {
                        const c = k.trim().toLowerCase();
                        return c === 'ชื่อสินค้า' || c === 'ชื่อ' || c === 'description' || c === 'item name' || c === 'name';
                    });

                    if (!idKey || !onHandKey) {
                        hideLoading();
                        Swal.fire({
                            icon: 'error',
                            title: 'โครงสร้างไฟล์ไม่ถูกต้อง',
                            html: `ไม่พบคอลัมน์ <b>"รหัสสินค้า"</b> หรือ <b>"On Hand"</b> ในไฟล์<br><br><span class="text-xs text-slate-500">คอลัมน์ที่พบในไฟล์: ${keys.join(', ')}</span>`,
                            customClass: { popup: 'rounded-2xl' }
                        });
                        return;
                    }

                    const erpMap = {};
                    rows.forEach(r => {
                        const rawId = String(r[idKey] || '').trim();
                        if (!rawId) return;

                        let qtyStr = String(r[onHandKey] !== undefined ? r[onHandKey] : '0').replace(/,/g, '').trim();
                        const qty = parseFloat(qtyStr);
                        if (isNaN(qty)) return;

                        const rawName = nameKey ? String(r[nameKey] || '').trim() : '';

                        if (!erpMap[rawId]) {
                            erpMap[rawId] = { id: rawId, name: rawName, qty: qty, count: 1 };
                        } else {
                            erpMap[rawId].qty += qty;
                            erpMap[rawId].count += 1;
                            if (!erpMap[rawId].name && rawName) erpMap[rawId].name = rawName;
                        }
                    });

                    const allProducts = (typeof db !== 'undefined' && db.products) ? db.products : [];
                    const erpIds = Object.keys(erpMap);

                    const matchedToUpdate = [];
                    const matchedUnchanged = [];
                    const notFoundInSystem = [];

                    erpIds.forEach(id => {
                        const item = erpMap[id];
                        const prod = allProducts.find(p => String(p.id).trim() === id);
                        if (prod) {
                            const currentStock = parseFloat(prod.stock_qty) || 0;
                            const newStock = item.qty;
                            const diff = newStock - currentStock;
                            const dataObj = {
                                id: id,
                                name: prod.name || item.name || 'ไม่ระบุชื่อ',
                                unit: prod.unit || 'ชิ้น',
                                currentStock: currentStock,
                                newStock: newStock,
                                diff: diff
                            };

                            if (diff !== 0) {
                                matchedToUpdate.push(dataObj);
                            } else {
                                matchedUnchanged.push(dataObj);
                            }
                        } else {
                            notFoundInSystem.push({
                                id: id,
                                name: item.name || 'ไม่ระบุชื่อ',
                                erpQty: item.qty
                            });
                        }
                    });

                    matchedToUpdate.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

                    hideLoading();
                    erpPreviewState = {
                        matchedToUpdate: matchedToUpdate,
                        matchedUnchanged: matchedUnchanged,
                        notFoundInSystem: notFoundInSystem,
                        fileName: file.name,
                        activeTab: matchedToUpdate.length > 0 ? 'update' : (matchedUnchanged.length > 0 ? 'unchanged' : 'notfound')
                    };
                    renderErpStockPreviewModal();
                } catch (err) {
                    hideLoading();
                    console.error(err);
                    Swal.fire({
                        icon: 'error',
                        title: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์',
                        text: err.message,
                        customClass: { popup: 'rounded-2xl' }
                    });
                }
            };
            reader.onerror = function() {
                hideLoading();
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่สามารถอ่านไฟล์ได้',
                    text: 'เกิดข้อผิดพลาดในการอ่านไฟล์จากอุปกรณ์',
                    customClass: { popup: 'rounded-2xl' }
                });
            };
            reader.readAsArrayBuffer(file);
        };

        window.setErpPreviewTab = function(tab) {
            erpPreviewState.activeTab = tab;
            renderErpStockPreviewModal();
        };

        function renderErpStockPreviewModal() {
            const { matchedToUpdate, matchedUnchanged, notFoundInSystem, fileName, activeTab } = erpPreviewState;
            const totalErpItems = matchedToUpdate.length + matchedUnchanged.length + notFoundInSystem.length;

            let tableRowsHtml = '';
            let currentList = [];

            if (activeTab === 'update') {
                currentList = matchedToUpdate;
                if (currentList.length === 0) {
                    tableRowsHtml = '<tr><td colspan="5" class="py-8 text-center text-slate-400">สต็อกในระบบตรงกับ ERP ทั้งหมดแล้ว ไม่มียอดที่ต้องปรับปรุง</td></tr>';
                } else {
                    tableRowsHtml = currentList.slice(0, 100).map(it => {
                        const diffBadge = it.diff > 0 
                            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">+${it.diff.toLocaleString()}</span>`
                            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">${it.diff.toLocaleString()}</span>`;
                        return `
                            <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                                <td class="p-2.5 font-mono text-slate-500">${escapeHTML(it.id)}</td>
                                <td class="p-2.5 font-medium text-slate-800">${escapeHTML(it.name)}</td>
                                <td class="p-2.5 text-right font-mono text-slate-500">${it.currentStock.toLocaleString()}</td>
                                <td class="p-2.5 text-right font-mono font-bold text-blue-600">${it.newStock.toLocaleString()}</td>
                                <td class="p-2.5 text-center">${diffBadge}</td>
                            </tr>`;
                    }).join('');
                    if (currentList.length > 100) {
                        tableRowsHtml += `<tr><td colspan="5" class="p-2 text-center text-xs text-slate-400 italic bg-slate-50">...และอีก ${(currentList.length - 100).toLocaleString()} รายการ (จะได้รับการอัปเดตทั้งหมด)</td></tr>`;
                    }
                }
            } else if (activeTab === 'unchanged') {
                currentList = matchedUnchanged;
                if (currentList.length === 0) {
                    tableRowsHtml = '<tr><td colspan="5" class="py-8 text-center text-slate-400">ไม่มีรายการที่ยอดตรงกัน</td></tr>';
                } else {
                    tableRowsHtml = currentList.slice(0, 100).map(it => `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                            <td class="p-2.5 font-mono text-slate-500">${escapeHTML(it.id)}</td>
                            <td class="p-2.5 font-medium text-slate-800">${escapeHTML(it.name)}</td>
                            <td class="p-2.5 text-right font-mono text-slate-600">${it.currentStock.toLocaleString()}</td>
                            <td class="p-2.5 text-right font-mono font-bold text-slate-700">${it.newStock.toLocaleString()}</td>
                            <td class="p-2.5 text-center"><span class="text-xs text-slate-400 font-mono">ตรงกัน (0)</span></td>
                        </tr>`).join('');
                    if (currentList.length > 100) {
                        tableRowsHtml += `<tr><td colspan="5" class="p-2 text-center text-xs text-slate-400 italic bg-slate-50">...และอีก ${(currentList.length - 100).toLocaleString()} รายการ</td></tr>`;
                    }
                }
            } else if (activeTab === 'notfound') {
                currentList = notFoundInSystem;
                if (currentList.length === 0) {
                    tableRowsHtml = '<tr><td colspan="5" class="py-8 text-center text-slate-400">ทุกรายการในไฟล์มีอยู่ในระบบครบถ้วน</td></tr>';
                } else {
                    tableRowsHtml = currentList.slice(0, 100).map(it => `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                            <td class="p-2.5 font-mono text-rose-500">${escapeHTML(it.id)}</td>
                            <td class="p-2.5 font-medium text-slate-700">${escapeHTML(it.name)}</td>
                            <td class="p-2.5 text-right text-slate-400 italic">-</td>
                            <td class="p-2.5 text-right font-mono font-bold text-slate-700">${it.erpQty.toLocaleString()}</td>
                            <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">ไม่พบในระบบ</span></td>
                        </tr>`).join('');
                    if (currentList.length > 100) {
                        tableRowsHtml += `<tr><td colspan="5" class="p-2 text-center text-xs text-slate-400 italic bg-slate-50">...และอีก ${(currentList.length - 100).toLocaleString()} รายการ (ข้ามการอัปเดต)</td></tr>`;
                    }
                }
            }

            const modalHtml = `
                <div class="space-y-4 text-left">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
                        <span class="text-slate-500 flex items-center gap-1.5"><i class="fa-solid fa-file-csv text-emerald-600"></i> ไฟล์: <b class="text-slate-700">${escapeHTML(fileName)}</b></span>
                        <span class="text-slate-400 font-mono">ทั้งหมด ${totalErpItems.toLocaleString()} รายการ</span>
                    </div>

                    <!-- Metric Cards -->
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <button type="button" onclick="setErpPreviewTab('update')" class="p-2.5 rounded-xl border transition-all ${activeTab === 'update' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}">
                            <div class="text-[11px] font-semibold text-slate-500">ต้องปรับปรุงยอด</div>
                            <div class="text-lg font-extrabold text-blue-600 mt-0.5">${matchedToUpdate.length.toLocaleString()}</div>
                            <div class="text-[10px] text-slate-400">รายการที่ยอดเปลี่ยน</div>
                        </button>
                        <button type="button" onclick="setErpPreviewTab('unchanged')" class="p-2.5 rounded-xl border transition-all ${activeTab === 'unchanged' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}">
                            <div class="text-[11px] font-semibold text-slate-500">ยอดตรงอยู่แล้ว</div>
                            <div class="text-lg font-extrabold text-emerald-600 mt-0.5">${matchedUnchanged.length.toLocaleString()}</div>
                            <div class="text-[10px] text-slate-400">ไม่ต้องปรับ</div>
                        </button>
                        <button type="button" onclick="setErpPreviewTab('notfound')" class="p-2.5 rounded-xl border transition-all ${activeTab === 'notfound' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}">
                            <div class="text-[11px] font-semibold text-slate-500">ไม่พบในระบบ</div>
                            <div class="text-lg font-extrabold text-amber-600 mt-0.5">${notFoundInSystem.length.toLocaleString()}</div>
                            <div class="text-[10px] text-slate-400">จะข้ามรายการนี้</div>
                        </button>
                    </div>

                    <!-- Preview Table Container -->
                    <div class="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                        <div class="max-h-64 overflow-y-auto">
                            <table class="w-full text-left border-collapse">
                                <thead class="sticky top-0 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200 z-10">
                                    <tr>
                                        <th class="p-2.5">รหัสสินค้า</th>
                                        <th class="p-2.5">ชื่อสินค้า</th>
                                        <th class="p-2.5 text-right">สต็อกเดิม</th>
                                        <th class="p-2.5 text-right">สต็อก ERP</th>
                                        <th class="p-2.5 text-center">ผลต่าง</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${tableRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    ${matchedToUpdate.length > 0 ? `
                        <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                            <i class="fa-solid fa-triangle-exclamation text-amber-600 text-sm mt-0.5"></i>
                            <div>
                                <b>คำเตือน:</b> การกดยืนยันจะปรับปรุงยอดคงเหลือของอะไหล่จำนวน <b>${matchedToUpdate.length.toLocaleString()} รายการ</b> ในระบบทันที พร้อมบันทึกล็อตและประวัติการปรับปรุงสต็อก (Restock Transaction)
                            </div>
                        </div>` : ''}
                </div>`;

            Swal.fire({
                title: '<i class="fa-solid fa-file-circle-check text-emerald-600 mr-2"></i>ตรวจสอบยอดสต็อก ERP',
                html: modalHtml,
                width: '780px',
                showCancelButton: true,
                confirmButtonText: matchedToUpdate.length > 0 ? `<i class="fa-solid fa-cloud-arrow-up mr-1.5"></i> ยืนยันอัปเดตสต็อก (${matchedToUpdate.length.toLocaleString()} รายการ)` : 'ปิดหน้าต่าง',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: matchedToUpdate.length > 0 ? '#059669' : '#6b7280',
                cancelButtonColor: '#94a3b8',
                showConfirmButton: true,
                reverseButtons: true,
                customClass: {
                    popup: 'rounded-3xl',
                    confirmButton: 'rounded-xl font-semibold !text-xs !py-2.5 !px-5',
                    cancelButton: 'rounded-xl font-semibold !text-xs !py-2.5 !px-5'
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    if (matchedToUpdate.length > 0) {
                        await executeSyncErpStock(matchedToUpdate);
                    }
                }
            });
        }
        window.renderErpStockPreviewModal = renderErpStockPreviewModal;

        async function executeSyncErpStock(itemsToUpdate) {
            if (!itemsToUpdate || itemsToUpdate.length === 0) return;

            showLoading(`กำลังบันทึกการปรับปรุงสต็อก ${itemsToUpdate.length} รายการ...`);
            try {
                const operator = (isLoggedIn && currentUser && currentUser.fullName) ? currentUser.fullName : 'สโตร์ (ERP Sync)';
                const payload = {
                    requester: operator,
                    department: 'สโตร์ (อัปเดตสต็อก ERP)',
                    note: `อัปเดตสต็อกจากไฟล์ ERP (${itemsToUpdate.length} รายการ)`,
                    items: itemsToUpdate.map(it => ({
                        id: it.id,
                        newQty: it.newStock,
                        currentStock: it.currentStock,
                        diff: it.diff
                    }))
                };

                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'syncErpStock', payload: payload })
                });
                const resData = await res.json();
                hideLoading();

                if (resData.status === 'success') {
                    await Swal.fire({
                        icon: 'success',
                        title: 'อัปเดตสต็อกสำเร็จ!',
                        html: `
                            <div class="text-left text-xs space-y-2 text-slate-600">
                                <p class="font-bold text-slate-800 text-sm">ระบบได้ปรับปรุงยอดคงเหลือเรียบร้อยแล้ว</p>
                                <ul class="list-disc pl-5 space-y-1">
                                    <li>อัปเดตยอดสินค้า: <b class="text-emerald-600">${itemsToUpdate.length.toLocaleString()} รายการ</b></li>
                                    <li>บันทึกประวัติ Transaction: <span class="font-mono font-bold text-slate-700">${resData.data?.transaction_id || '-'}</span></li>
                                </ul>
                            </div>`,
                        confirmButtonColor: '#059669',
                        confirmButtonText: 'ตกลง',
                        customClass: {
                            popup: 'rounded-2xl',
                            confirmButton: 'rounded-xl font-semibold !text-xs !py-2 !px-4'
                        }
                    });
                    await fetchData(true);
                    if (typeof renderCatalog === 'function') renderCatalog();
                    if (typeof renderRestockTable === 'function') renderRestockTable();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'เกิดข้อผิดพลาด',
                        text: resData.message || 'ไม่สามารถอัปเดตสต็อกได้',
                        customClass: { popup: 'rounded-2xl' }
                    });
                }
            } catch (err) {
                hideLoading();
                console.error(err);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: err.message || 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้',
                    customClass: { popup: 'rounded-2xl' }
                });
            }
        }
        window.executeSyncErpStock = executeSyncErpStock;
