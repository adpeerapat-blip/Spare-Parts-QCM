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
                await fetchData(false);
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
                    stockCellHtml = `<span class="font-extrabold text-blue-600 text-base">${p.stock_qty || 0}</span>`;
                }

                let tr = `
                    <tr class="hover:bg-blue-50/30 border-b border-gray-200 transition ${isCancelled ? 'bg-red-50/10' : ''} ${bulkStockChanges[p.id] !== undefined ? 'bg-emerald-50/30' : ''}">
                        <td class="p-4 text-center text-gray-500 font-medium">${itemIndex}</td>
                        <td class="p-3"><img src="${escapeHTML(p.image_url || 'https://placehold.co/100x100?text=NoImg')}" class="w-12 h-12 object-cover rounded-lg shadow-sm border border-gray-200 bg-white ${isCancelled ? 'opacity-50 grayscale' : ''}" onerror="this.src='https://placehold.co/100x100?text=Err'"></td>
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
                    await fetchData(false);
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
                    await fetchData(false);
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

        function exportReportToExcel() {
            if (!lastFilteredReportProducts || lastFilteredReportProducts.length === 0) {
                showToast('ไม่มีข้อมูลสำหรับส่งออก', 'warning');
                return;
            }
            
            let csvContent = "\uFEFF";
            
            // Headers
            const headers = ['ลำดับ', 'รหัสสินค้า', 'ชื่อสินค้า', 'เครื่องจักร', 'Serial Number', 'จำนวนที่เบิก', 'ราคาต้นทุน', 'ราคา (กลาง)', 'ราคา (ตัวแทน)', 'ราคา (ในเครือ)'];
            const formattedHeaders = headers.map(h => {
                if (h.includes(',') || h.includes('\n') || h.includes('"')) {
                    return `"${h.replace(/"/g, '""')}"`;
                }
                return h;
            });
            csvContent += formattedHeaders.join(',') + "\r\n";
            
            // Rows
            lastFilteredReportProducts.forEach((p, index) => {
                const qty = lastReportProductUsageMap.get(String(p.id)) || 0;
                const cost = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                const priceA = parseFloat(String(p.price_a).replace(/,/g, '')) || 0;
                const priceB = parseFloat(String(p.price_b).replace(/,/g, '')) || 0;
                const priceC = parseFloat(String(p.price_c).replace(/,/g, '')) || 0;
                
                const pIdStr = String(p.id).trim();
                const machSet = (lastReportProductMachinesMap && lastReportProductMachinesMap.get(pIdStr)) || new Set();
                const machText = Array.from(machSet).join(', ') || '-';

                const snSet = (lastReportProductSerialsMap && lastReportProductSerialsMap.get(pIdStr)) || new Set();
                const snText = Array.from(snSet).join(', ') || '-';
                const formattedSn = (snText === '-' || !snText) ? '-' : `="${snText.replace(/"/g, '""')}"`;

                const rowData = [
                    String(index + 1),
                    `="${p.id}"`, // Force Excel to treat Product ID as text
                    p.name,
                    machText,
                    formattedSn,
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
            
            const dateStr = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
            link.setAttribute("download", `รายงานการเบิกใช้อะไหล่_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('ส่งออกไฟล์ Excel (CSV) เรียบร้อยแล้ว', 'success');
        }
