/**
 * ====================================================================
 * Spare Parts QCM - Requisition & Approval Module (js/requisition.js)
 * ====================================================================
 * Point of Sale (POS) requisition, labor cost matrix, document approval
 * workflow, transactions history, and slip printing.
 */

        // ===== POS Searchable Dropdowns =====
        function openPOSCustomSelect(type) {
            const dropdown = document.getElementById('dropdown_pos' + (type === 'category' ? 'CategoryFilter' : 'MachineFilter'));
            dropdown.classList.remove('hidden');
            renderPOSCustomSelect(type, true);
            setTimeout(() => { document.getElementById('input_pos' + (type === 'category' ? 'CategoryFilter' : 'MachineFilter')).select(); }, 10);
        }

        function filterPOSCustomSelect(type) {
            const dropdown = document.getElementById('dropdown_pos' + (type === 'category' ? 'CategoryFilter' : 'MachineFilter'));
            dropdown.classList.remove('hidden');
            renderPOSCustomSelect(type, false);
        }

        function renderPOSCustomSelect(type, forceShowAll = false) {
            const isCat = type === 'category';
            const inputId = isCat ? 'input_posCategoryFilter' : 'input_posMachineFilter';
            const dropdownId = isCat ? 'dropdown_posCategoryFilter' : 'dropdown_posMachineFilter';
            
            const keywordString = forceShowAll ? '' : document.getElementById(inputId).value.toLowerCase();
            const keywords = keywordString.split(/\s+/).filter(k => k.length > 0);
            const dropdown = document.getElementById(dropdownId);
            dropdown.innerHTML = '';
            
            let allOptionHtml = `
                <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-800 font-medium bg-gray-50" 
                     onclick="selectPOSCustomOption('${type}', 'all', '')">
                    -- ${isCat ? 'ทุกประเภทอะไหล่' : 'ทุกเครื่องจักร'} --
                </div>`;
            dropdown.insertAdjacentHTML('beforeend', allOptionHtml);

            let matchCount = 0;
            if (isCat) {
                const categories = [...new Set(db.products.map(p => p.category))].filter(c => c && c.trim() !== '');
                categories.sort();
                categories.forEach(c => {
                    const textToSearch = c.toLowerCase();
                    if (keywords.length === 0 || keywords.every(kw => textToSearch.includes(kw))) {
                        dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-700" onclick="selectPOSCustomOption('category', '${escapeForJS(c)}', '${escapeForJS(c)}')">${escapeHTML(c)}</div>`);
                        matchCount++;
                    }
                });
            } else {
                const displayLimit = 50;
                const machines = [...db.machines];
                machines.sort((a, b) => String(a.name).localeCompare(String(b.name)));
                machines.forEach(m => {
                    const textToSearch = `${m.id} ${m.name}`.toLowerCase();
                    if (keywords.length === 0 || keywords.every(kw => textToSearch.includes(kw))) {
                        if (matchCount < displayLimit) {
                            dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition text-gray-700" onclick="selectPOSCustomOption('machine', '${escapeForJS(m.id)}', '${escapeForJS(m.name)}')">${escapeHTML(m.name)}</div>`);
                        }
                        matchCount++;
                    }
                });
                if (matchCount > displayLimit) {
                    dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-2 text-center bg-amber-50 text-xs text-amber-600 font-medium border-t border-amber-100"><i class="fa-solid fa-info-circle mr-1"></i>พบอีก ${matchCount - displayLimit} รายการ — พิมพ์เพิ่มเพื่อค้นหา</div>`);
                }
            }
            if (matchCount === 0 && keywords.length > 0) dropdown.insertAdjacentHTML('beforeend', `<div class="px-4 py-3 text-gray-400 text-sm text-center">ไม่พบข้อมูลที่ค้นหา</div>`);
        }

        function selectPOSCustomOption(type, value, displayName) {
            const isCat = type === 'category';
            const hiddenId = isCat ? 'posCategoryFilter' : 'posMachineFilter';
            const inputId = isCat ? 'input_posCategoryFilter' : 'input_posMachineFilter';
            const dropdownId = isCat ? 'dropdown_posCategoryFilter' : 'dropdown_posMachineFilter';
            
            document.getElementById(hiddenId).value = value;
            document.getElementById(inputId).value = value === 'all' ? '' : displayName;
            document.getElementById(dropdownId).classList.add('hidden');
            
            renderPOSGrid();
        }


        // ===== POS (Point of Sale) Client Logic =====
        let posCart = [];
        // transactions is declared in common.js

        function initPOS() {
            posCart = [];
            document.getElementById('posBarcodeScanner').value = '';
            document.getElementById('posSearchInput').value = '';
            document.getElementById('posCategoryFilter').value = 'all';
            document.getElementById('input_posCategoryFilter').value = '';
            document.getElementById('posMachineFilter').value = 'all';
            document.getElementById('input_posMachineFilter').value = '';
            
            // Reset mobile inputs
            const mRequester = document.getElementById('mobile_pos_requester');
            if (mRequester) {
                mRequester.value = (isLoggedIn && currentUser) ? (currentUser.fullName || '') : '';
            }
            const mDept = document.getElementById('mobile_pos_department');
            if (mDept) {
                mDept.value = (isLoggedIn && currentUser) ? (currentUser.department || '') : '';
            }
            populateApproversDropdown('mobile_pos_approver');
            const mNote = document.getElementById('mobile_pos_note');
            if (mNote) mNote.value = '';



            // Reset mobile cart state
            isMobileCartOpen = false;
            if (typeof toggleMobileCart === 'function') {
                toggleMobileCart(false);
            }

            // Focus barcode input
            setTimeout(() => {
                const scanner = document.getElementById('posBarcodeScanner');
                if (scanner) scanner.focus();
            }, 100);

            // รีเซ็ตแท็บกลับมาหน้าเลือกอะไหล่บนมือถือ
            if (typeof switchPOSTab === 'function') switchPOSTab('products');

            renderPOSGrid();
            updatePOSCartUI();
        }

        function renderPOSGrid() {
            const grid = document.getElementById('posProductGrid');
            const searchKeyword = document.getElementById('posSearchInput').value.toLowerCase();
            const keywords = searchKeyword.split(/\s+/).filter(k => k.length > 0);
            const selectedCategory = document.getElementById('posCategoryFilter').value;
            const selectedMachine = document.getElementById('posMachineFilter') ? document.getElementById('posMachineFilter').value : 'all';
            
            grid.innerHTML = '';
            
            // Build map of machine IDs for mapped products
            let mappedProductIds = new Set();
            if (selectedMachine !== 'all') {
                db.mappings.filter(m => String(m.machine_id) === selectedMachine).forEach(m => mappedProductIds.add(String(m.product_id)));
            }
            
            let filtered = db.products.filter(p => {
                const isCancelled = p.note && (p.note.trim() === 'ยกเลิกใช้' || p.note.includes('ยกเลิกใช้'));
                if (isCancelled) return false;
                
                const textToSearch = `${p.id} ${p.name}`.toLowerCase();
                const matchSearch = keywords.length === 0 || keywords.every(kw => textToSearch.includes(kw));
                const matchCategory = selectedCategory === 'all' || p.category === selectedCategory;
                const matchMachine = selectedMachine === 'all' || mappedProductIds.has(String(p.id));
                return matchSearch && matchCategory && matchMachine;
            });
            
            if (filtered.length === 0) {
                grid.innerHTML = `<div class="col-span-full py-10 flex flex-col items-center justify-center text-gray-400"><i class="fa-solid fa-box-open text-3xl mb-2 opacity-55"></i><p class="text-xs">ไม่พบอะไหล่ตามเงื่อนไข</p></div>`;
                return;
            }
            
            // เรียงรายการที่มีของมาแสดงก่อน (stock_qty > 0)
            filtered.sort((a, b) => {
                const stockA = a.stock_qty > 0 ? 1 : 0;
                const stockB = b.stock_qty > 0 ? 1 : 0;
                if (stockA !== stockB) {
                    return stockB - stockA; // มีสต็อกขึ้นก่อน
                }
                return String(a.id).localeCompare(String(b.id)); // เรียงตาม ID ย่อย
            });

            filtered.forEach(p => {
                let imgSource = p.image_url ? p.image_url : `https://placehold.co/200x150/f8fafc/94a3b8?text=No+Image`;
                const costVal = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                const pA = fNumber(p.price_a, costVal * 2.1);
                
                // เช็คยอดสต็อกและจัดแต่งหน้าตา
                let cardClass = "";
                let imageOverlayHtml = "";
                let stockStatusHtml = "";
                let isOutOfStock = p.stock_qty <= 0;
                
                if (isOutOfStock) {
                    cardClass = "bg-red-50/20 border-red-200 hover:border-red-300 cursor-not-allowed opacity-75";
                    imageOverlayHtml = `
                        <div class="absolute inset-0 bg-red-50/20 backdrop-blur-[0.5px] flex items-center justify-center z-10 pointer-events-none">
                            <span class="bg-red-600/90 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg shadow-md border border-white tracking-wider uppercase transform -rotate-12 select-none">
                                OUT OF STOCK
                            </span>
                        </div>
                    `;
                    stockStatusHtml = `<span class="text-[10px] font-bold text-red-600 bg-red-50 border border-red-150 px-2 py-0.5 rounded-md">คลัง: 0</span>`;
                } else {
                    cardClass = "bg-white border-gray-200 hover:border-amber-400 shadow-sm hover:-translate-y-0.5 cursor-pointer";
                    if (p.stock_qty <= 5) {
                        stockStatusHtml = `<span class="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-150 px-2 py-0.5 rounded-md">เหลือน้อย: ${p.stock_qty}</span>`;
                    } else {
                        stockStatusHtml = `<span class="text-[10px] font-bold text-green-600 bg-green-50 border border-green-150 px-2 py-0.5 rounded-md">คลัง: ${p.stock_qty}</span>`;
                    }
                }
                
                let itemHtml = `
                    <div onclick="${isOutOfStock ? 'showToast(\'สินค้าชิ้นนี้หมดสต็อก\', \'error\')' : `showPOSQuantityPopup('${escapeForJS(p.id)}')`}" 
                         class="${cardClass} p-3 rounded-xl border flex flex-col justify-between transition-all duration-300 relative">
                        <div class="h-24 bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center mb-2 relative">
                            <img src="${escapeHTML(imgSource)}" class="max-h-full max-w-full object-contain p-1 ${isOutOfStock ? 'filter grayscale-[30%] opacity-55' : ''}" onerror="this.src='https://placehold.co/200x150/f8fafc/94a3b8?text=Err'">
                            <span class="absolute top-1 left-1 bg-slate-900/80 backdrop-blur text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded z-10">${escapeHTML(p.id)}</span>
                            ${imageOverlayHtml}
                        </div>
                        <div class="flex-1 flex flex-col justify-between">
                            <div>
                                <h4 class="text-xs font-bold ${isOutOfStock ? 'text-gray-500' : 'text-gray-800'} line-clamp-2 min-h-[32px] leading-tight mb-1" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h4>
                                <div class="flex justify-between items-center mb-2">
                                    <span class="text-[10px] text-gray-400 truncate max-w-[70%]">${escapeHTML(p.category || 'ทั่วไป')}</span>
                                    <span class="text-[9px] text-gray-400 font-bold uppercase">${escapeHTML(p.unit || 'ชิ้น')}</span>
                                </div>
                            </div>
                            <div class="flex justify-between items-center mt-auto border-t border-slate-50 pt-2">
                                <span class="font-extrabold ${isOutOfStock ? 'text-gray-400' : 'text-blue-600'} text-xs sm:text-sm">฿${pA}</span>
                                ${stockStatusHtml}
                            </div>
                        </div>
                    </div>
                `;
                grid.insertAdjacentHTML('beforeend', itemHtml);
            });
        }

        // คีย์บอร์ด ดักจับยิงเครื่องบาร์โค้ด
        function handlePOSBarcode(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                const barcode = event.target.value.trim();
                if (!barcode) return;
                
                // ค้นหาอะไหล่
                const p = db.products.find(x => String(x.id).toLowerCase() === barcode.toLowerCase());
                if (p) {
                    const isCancelled = p.note && (p.note.trim() === 'ยกเลิกใช้' || p.note.includes('ยกเลิกใช้'));
                    if (isCancelled) {
                        showToast("ไม่สามารถเบิกอะไหล่ชิ้นนี้ได้ เนื่องจากถูกระงับใช้ชั่วคราว", "error");
                    } else if (p.stock_qty <= 0) {
                        showToast(`ไม่สามารถเพิ่มอะไหล่ได้ เนื่องจากอะไหล่รหัส ${p.id} หมดสต็อก`, "error");
                    } else {
                        showPOSQuantityPopup(p.id);
                    }
                } else {
                    showToast(`ไม่พบรหัสสินค้า "${barcode}" ในระบบ`, "error");
                }
                event.target.value = '';
                event.target.focus();
            }
        }

        function showPOSQuantityPopup(productId) {
            const p = db.products.find(x => x.id == productId);
            if (!p) return;
            
            const isCancelled = p.note && (p.note.trim() === 'ยกเลิกใช้' || p.note.includes('ยกเลิกใช้'));
            if (isCancelled) {
                showToast("ไม่สามารถเบิกอะไหล่ชิ้นนี้ได้ เนื่องจากถูกระงับใช้ชั่วคราว", "error");
                return;
            }
            if (p.stock_qty <= 0) {
                showToast(`ไม่สามารถเพิ่มอะไหล่ได้ เนื่องจากอะไหล่รหัส ${p.id} หมดสต็อก`, "error");
                return;
            }

            const existing = posCart.find(item => item.id == productId);
            const existingQty = existing ? existing.qty : 0;
            const maxAvailable = p.stock_qty - existingQty;

            if (maxAvailable <= 0) {
                showToast(`สินค้าในตะกร้าเท่ากับจำนวนสต็อกที่มีแล้ว (มีคลัง ${p.stock_qty} ${p.unit || 'ชิ้น'})`, "error");
                return;
            }

            Swal.fire({
                title: 'ระบุจำนวนที่ต้องการเบิก',
                html: `
                    <div class="text-left space-y-2.5">
                        <div class="bg-slate-50 p-3 rounded-xl border border-gray-150 flex gap-3 items-center">
                            <img src="${escapeHTML(p.image_url || 'https://placehold.co/200x150/f8fafc/94a3b8?text=No+Image')}" class="w-14 h-14 object-contain rounded-lg border bg-white flex-shrink-0" onerror="this.src='https://placehold.co/200x150/f8fafc/94a3b8?text=Err'">
                            <div class="min-w-0 flex-1">
                                <span class="text-[9px] font-mono bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">${escapeHTML(p.id)}</span>
                                <h4 class="text-xs font-bold text-slate-800 truncate mt-1">${escapeHTML(p.name)}</h4>
                                <p class="text-[10px] text-slate-500 mt-0.5">ประเภท: ${escapeHTML(p.category || 'ทั่วไป')} | หน่วยนับ: ${escapeHTML(p.unit || 'ชิ้น')}</p>
                            </div>
                        </div>
                        <div class="flex justify-between items-center text-xs px-1">
                            <span class="text-gray-500 font-medium">สต็อกคงเหลือในคลัง:</span>
                            <span class="font-bold text-green-600">${p.stock_qty} ${p.unit || 'ชิ้น'}</span>
                        </div>
                        ${existingQty > 0 ? `
                        <div class="flex justify-between items-center text-xs px-1 border-t border-slate-100 pt-1.5">
                            <span class="text-gray-500 font-medium">มีอยู่ในตะกร้าแล้ว:</span>
                            <span class="font-bold text-blue-600">${existingQty} ${p.unit || 'ชิ้น'}</span>
                        </div>
                        ` : ''}
                    </div>
                `,
                input: 'number',
                inputAttributes: {
                    min: 1,
                    max: maxAvailable,
                    step: 1
                },
                inputValue: 1,
                showCancelButton: true,
                confirmButtonText: 'ใส่ตะกร้า',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#d97706', // amber-600
                cancelButtonColor: '#6e7881',
                inputValidator: (value) => {
                    const qty = parseInt(value);
                    if (isNaN(qty) || qty <= 0) {
                        return 'กรุณาระบุจำนวนที่ถูกต้องอย่างน้อย 1 ชิ้น';
                    }
                    if (qty > maxAvailable) {
                        return `ระบุเกินจำนวนที่เบิกได้ (เบิกเพิ่มได้สูงสุด ${maxAvailable} ${p.unit || 'ชิ้น'})`;
                    }
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const qtyToAdd = parseInt(result.value);
                    addToPOSCartWithQty(productId, qtyToAdd);
                    showToast(`เพิ่มอะไหล่ ${p.id} จำนวน ${qtyToAdd} ${p.unit || 'ชิ้น'} สำเร็จ`, "success");
                }
            });
        }

        function addToPOSCartWithQty(productId, qty) {
            const p = db.products.find(x => x.id == productId);
            if (!p) return;
            
            const existing = posCart.find(item => item.id == productId);
            if (existing) {
                existing.qty += qty;
            } else {
                const costVal = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                
                let selectedPrice = 0;
                const userPriceLevel = (currentUser && currentUser.priceLevel) ? currentUser.priceLevel : 'A';
                
                if (userPriceLevel === 'B') {
                    selectedPrice = parseFloat(p.price_b) > 0 ? parseFloat(p.price_b) : (costVal * 1.7);
                } else if (userPriceLevel === 'C') {
                    selectedPrice = parseFloat(p.price_c) > 0 ? parseFloat(p.price_c) : (costVal * 1.3);
                } else if (userPriceLevel === 'COST') {
                    selectedPrice = costVal;
                } else {
                    selectedPrice = parseFloat(p.price_a) > 0 ? parseFloat(p.price_a) : (costVal * 2.1);
                }
                
                posCart.push({
                    id: p.id,
                    name: p.name,
                    unit: p.unit || 'ชิ้น',
                    price: selectedPrice,
                    maxStock: p.stock_qty,
                    qty: qty
                });
            }
            updatePOSCartUI();
        }

        function updatePOSCartItemQty(productId, newQty) {
            const item = posCart.find(x => x.id == productId);
            if (!item) return;
            
            const qty = parseInt(newQty) || 0;
            if (qty <= 0) {
                removeFromPOSCart(productId);
                return;
            }
            
            if (qty > item.maxStock) {
                showToast(`ไม่สามารถระบุจำนวนเบิกเกินสต็อกที่มีอยู่ได้ (มีคลัง ${item.maxStock} ${item.unit})`, "error");
                item.qty = item.maxStock;
            } else {
                item.qty = qty;
            }
            updatePOSCartUI();
        }

        function removeFromPOSCart(productId) {
            posCart = posCart.filter(item => item.id != productId);
            updatePOSCartUI();
        }

        function clearPOSCart() {
            posCart = [];
            updatePOSCartUI();
        }

        function updatePOSCartUI() {
            const list = document.getElementById('posCartList');
            const checkoutBtn = document.getElementById('posCheckoutBtn');
            const cartCountEl = document.getElementById('posCartCount');
            const cartTotalEl = document.getElementById('posCartTotal');
            
            // Mobile elements
            const mobileBadge = document.getElementById('mobileCartBadge');
            const mobileSubtitle = document.getElementById('mobileCartSubtitle');
            const mobileList = document.getElementById('mobileCartItemsList');
            const mobileTotalQtyEl = document.getElementById('mobileCartTotalQty');
            const mobileCheckoutBtn = document.getElementById('mobilePOSCheckoutBtn');
            
            list.innerHTML = '';
            
            if (posCart.length === 0) {
                list.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center py-20 text-slate-500">
                        <i class="fa-solid fa-shopping-basket text-5xl mb-4 opacity-40"></i>
                        <p class="text-xs">ตะกร้าว่างเปล่า</p>
                        <p class="text-[10px] opacity-75 mt-1 text-center">คลิกเลือกรายการอะไหล่<br>หรือพิมพ์สแกนรหัสเพื่อเบิก</p>
                    </div>
                `;
                checkoutBtn.disabled = true;
                cartCountEl.textContent = '0 รายการ (0 ชิ้น)';
                cartTotalEl.textContent = '฿0.00';
                
                // Update Mobile UI for empty cart
                if (mobileBadge) mobileBadge.textContent = '0';
                if (mobileSubtitle) mobileSubtitle.textContent = 'มี 0 ชิ้นในตะกร้า';
                if (mobileTotalQtyEl) mobileTotalQtyEl.textContent = '0';
                if (mobileCheckoutBtn) mobileCheckoutBtn.disabled = true;
                if (mobileList) {
                    mobileList.innerHTML = `
                        <div class="py-8 text-center text-gray-400 text-xs">
                            <i class="fa-solid fa-shopping-basket text-3xl mb-2 opacity-30"></i>
                            <p>ไม่มีสินค้าในตะกร้า</p>
                        </div>
                    `;
                }
                
                // Close/Hide the bottom sheet on mobile if empty
                if (typeof toggleMobileCart === 'function') {
                    toggleMobileCart(isMobileCartOpen);
                }
                return;
            }
            
            checkoutBtn.disabled = false;
            let total = 0;
            let totalQty = 0;
            
            posCart.forEach(item => {
                const subtotal = item.price * item.qty;
                total += subtotal;
                totalQty += item.qty;
                
                let itemHtml = `
                    <div class="bg-slate-800/80 border border-slate-700/50 p-3 rounded-xl flex items-center justify-between gap-3 relative transition-all">
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start gap-1">
                                <span class="text-[9px] font-mono bg-slate-700 text-slate-300 font-bold px-1 py-0.5 rounded block truncate">${escapeHTML(item.id)}</span>
                                <button onclick="removeFromPOSCart('${escapeForJS(item.id)}')" class="text-slate-400 hover:text-red-400 transition" title="ลบรายการ"><i class="fa-solid fa-times text-xs"></i></button>
                            </div>
                            <h5 class="text-xs font-semibold text-slate-100 truncate mt-1.5" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</h5>
                            
                            <div class="flex items-center justify-between mt-2.5">
                                <span class="text-xs font-bold text-amber-400">฿${(item.price).toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                                <div class="flex items-center bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                                    <button type="button" onclick="updatePOSCartItemQty('${escapeForJS(item.id)}', ${item.qty - 1})" class="px-2 py-1 text-slate-400 hover:text-white transition"><i class="fa-solid fa-minus text-[9px]"></i></button>
                                    <input type="number" value="${item.qty}" min="1" max="${item.maxStock}" onchange="updatePOSCartItemQty('${escapeForJS(item.id)}', this.value)" class="w-10 bg-transparent text-center text-xs font-bold text-white focus:outline-none border-none py-0.5 p-0">
                                    <button type="button" onclick="updatePOSCartItemQty('${escapeForJS(item.id)}', ${item.qty + 1})" class="px-2 py-1 text-slate-400 hover:text-white transition"><i class="fa-solid fa-plus text-[9px]"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                list.insertAdjacentHTML('beforeend', itemHtml);
            });
            
            cartCountEl.textContent = `${posCart.length} รายการ (${totalQty} ชิ้น)`;
            cartTotalEl.textContent = '฿' + total.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});

            // Update Mobile UI for non-empty cart
            if (mobileBadge) mobileBadge.textContent = totalQty;
            if (mobileSubtitle) mobileSubtitle.textContent = `มี ${totalQty} ชิ้นในตะกร้า`;
            if (mobileTotalQtyEl) mobileTotalQtyEl.textContent = totalQty;
            if (mobileCheckoutBtn) mobileCheckoutBtn.disabled = false;
            
            if (mobileList) {
                mobileList.innerHTML = '';
                posCart.forEach(item => {
                    const itemHtml = `
                        <div class="bg-white p-3 rounded-xl border border-gray-150 flex items-center justify-between gap-3 shadow-sm">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[9px] font-mono bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">${escapeHTML(item.id)}</span>
                                </div>
                                <h5 class="text-xs font-bold text-slate-800 truncate mt-1.5">${escapeHTML(item.name)}</h5>
                                <span class="text-xs font-extrabold text-blue-600 mt-1 block">฿${(item.price).toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div class="flex flex-col items-end justify-between gap-2.5">
                                <button onclick="removeFromPOSCart('${escapeForJS(item.id)}')" class="text-gray-400 hover:text-red-500 transition p-1" title="ลบรายการ"><i class="fa-solid fa-trash-alt text-xs"></i></button>
                                <div class="flex items-center bg-slate-100 rounded-lg border border-gray-200 overflow-hidden">
                                    <button type="button" onclick="updatePOSCartItemQty('${escapeForJS(item.id)}', ${item.qty - 1})" class="px-2 py-0.5 text-gray-500 hover:text-black transition"><i class="fa-solid fa-minus text-[8px]"></i></button>
                                    <span class="px-2.5 bg-white text-center text-xs font-bold text-slate-850 border-x border-gray-250 min-w-[32px]">${item.qty}</span>
                                    <button type="button" onclick="updatePOSCartItemQty('${escapeForJS(item.id)}', ${item.qty + 1})" class="px-2 py-0.5 text-gray-500 hover:text-black transition"><i class="fa-solid fa-plus text-[8px]"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
                    mobileList.insertAdjacentHTML('beforeend', itemHtml);
                });
            }
            
            // Adjust/update position of bottom sheet if closed/partially visible
            if (typeof toggleMobileCart === 'function') {
                toggleMobileCart(isMobileCartOpen);
            }

            // อัปเดตตัวเลขแจ้งเตือน (Badge) บนแท็บมือถือ
            const tabBadge = document.getElementById('posTabCartBadge');
            if (tabBadge) {
                if (posCart.length > 0) {
                    tabBadge.textContent = posCart.length;
                    tabBadge.classList.remove('hidden');
                } else {
                    tabBadge.classList.add('hidden');
                }
            }
        }

        function switchPOSTab(tab) {
            const tabProductsBtn = document.getElementById('posTabProducts');
            const tabCartBtn = document.getElementById('posTabCart');
            const leftPanel = document.getElementById('posLeftPanel');
            const rightPanel = document.getElementById('posRightPanel');
            
            if (!tabProductsBtn || !tabCartBtn || !leftPanel || !rightPanel) return;
            
            if (tab === 'products') {
                // เลือกแท็บแสดงอะไหล่
                tabProductsBtn.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold text-center transition-all bg-white text-blue-600 shadow-sm';
                tabCartBtn.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold text-center transition-all text-gray-500 hover:text-gray-700 relative';
                
                leftPanel.classList.remove('hidden');
                leftPanel.classList.add('flex');
                
                rightPanel.classList.add('hidden');
                rightPanel.classList.remove('flex');
            } else {
                // เลือกแท็บแสดงตะกร้าเบิกจ่าย
                tabCartBtn.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold text-center transition-all bg-white text-blue-600 shadow-sm relative';
                tabProductsBtn.className = 'flex-1 py-2 px-3 rounded-lg text-xs font-bold text-center transition-all text-gray-500 hover:text-gray-700';
                
                leftPanel.classList.add('hidden');
                leftPanel.classList.remove('flex');
                
                rightPanel.classList.remove('hidden');
                rightPanel.classList.add('flex');
            }
        }

        // ===== Job Details (ขอบเขตงานซ่อม) Helpers =====
        function toggleJobDetailOther(isMobile) {
            const prefix = isMobile ? 'mobile_' : '';
            const chk = document.getElementById(prefix + 'pos_job_detail_other_check');
            const txt = document.getElementById(prefix + 'pos_job_detail_other_text');
            if (chk && txt) {
                if (chk.checked) {
                    txt.classList.remove('hidden');
                    txt.focus();
                } else {
                    txt.classList.add('hidden');
                    txt.value = '';
                }
            }
        }

        function resetJobDetails(isMobile) {
            const prefix = isMobile ? 'mobile_' : '';
            const checkboxes = document.querySelectorAll(`input[name="${prefix}pos_job_detail"]`);
            checkboxes.forEach(cb => cb.checked = false);
            const otherChk = document.getElementById(prefix + 'pos_job_detail_other_check');
            const otherTxt = document.getElementById(prefix + 'pos_job_detail_other_text');
            if (otherChk) otherChk.checked = false;
            if (otherTxt) {
                otherTxt.value = '';
                otherTxt.classList.add('hidden');
            }
        }

        function getSelectedJobDetails(isMobile) {
            const prefix = isMobile ? 'mobile_' : '';
            const details = [];
            const checkboxes = document.querySelectorAll(`input[name="${prefix}pos_job_detail"]:checked`);
            checkboxes.forEach(cb => {
                if (cb.value) details.push(cb.value);
            });
            const otherChk = document.getElementById(prefix + 'pos_job_detail_other_check');
            const otherTxt = document.getElementById(prefix + 'pos_job_detail_other_text');
            if (otherChk && otherChk.checked) {
                const customVal = otherTxt ? otherTxt.value.trim() : '';
                if (customVal) {
                    details.push(customVal);
                } else {
                    details.push('อื่นๆ');
                }
            }
            return details.join(', ');
        }

        function openPOSCheckoutModal() {
            if (posCart.length === 0) return;
            
            document.getElementById('formPOSCheckout').reset();
            resetJobDetails(false);
            
            if (isLoggedIn && currentUser) {
                document.getElementById('pos_requester').value = currentUser.fullName || '';
                document.getElementById('pos_department').value = currentUser.department || '';
            }
            
            // Populate approvers dropdown
            populateApproversDropdown('pos_approver');
            
            // Default Customer Type & Price Tier
            const custTypeEl = document.getElementById('pos_customer_type');
            const priceTierEl = document.getElementById('pos_price_tier');
            if (custTypeEl) custTypeEl.value = 'ลูกค้าภายนอก';
            if (priceTierEl) priceTierEl.value = 'ราคากลาง';
            
            // Reset machine model and repair level
            const modelEl = document.getElementById('pos_machine_model');
            const otherEl = document.getElementById('pos_machine_model_other');
            const repairEl = document.getElementById('pos_repair_level');
            const customLaborWrap = document.getElementById('pos_labor_cost_custom_wrap');
            const customLaborEl = document.getElementById('pos_labor_cost_custom');
            
            if (modelEl) modelEl.value = '';
            if (otherEl) {
                otherEl.value = '';
                otherEl.classList.add('hidden');
            }
            if (repairEl) repairEl.value = '';
            if (customLaborWrap) customLaborWrap.classList.add('hidden');
            if (customLaborEl) customLaborEl.value = 0;
            
            // Populate machines datalist
            const datalist = document.getElementById('pos_machines_list');
            if (datalist) {
                datalist.innerHTML = '';
                if (db && Array.isArray(db.machines)) {
                    db.machines.forEach(m => {
                        datalist.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(m.id)}">${escapeHTML(m.id)} : ${escapeHTML(m.name)}</option>`);
                    });
                }
            }
            
            // Initialize price tier recalculation & labor cost
            onPOSPriceTierChange(false);
            
            document.getElementById('posCheckoutModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closePOSCheckoutModal() {
            document.getElementById('posCheckoutModal').classList.add('hidden');
            document.body.style.overflow = '';
        }

        function toggleMobileCart(open) {
            const bottomSheet = document.getElementById('posMobileBottomSheet');
            const backdrop = document.getElementById('posMobileBottomSheetBackdrop');
            const chevron = document.getElementById('mobileCartChevron');
            
            if (!bottomSheet || !backdrop) return;
            
            if (open === undefined) {
                isMobileCartOpen = !isMobileCartOpen;
            } else {
                isMobileCartOpen = open;
            }
            
            if (isMobileCartOpen) {
                bottomSheet.classList.remove('translate-y-full');
                bottomSheet.classList.remove('translate-y-[calc(100%-80px)]');
                bottomSheet.classList.add('translate-y-0');
                backdrop.classList.remove('hidden');
                if (chevron) {
                    chevron.classList.remove('fa-chevron-up');
                    chevron.classList.add('fa-chevron-down');
                }
                
                // Populate mobile machines datalist
                const datalist = document.getElementById('mobile_pos_machines_list');
                if (datalist) {
                    datalist.innerHTML = '';
                    if (db && Array.isArray(db.machines)) {
                        db.machines.forEach(m => {
                            datalist.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(m.id)}">${escapeHTML(m.id)} : ${escapeHTML(m.name)}</option>`);
                        });
                    }
                }
                
                // Pre-fill requester and department if logged in
                if (isLoggedIn && currentUser) {
                    const reqInput = document.getElementById('mobile_pos_requester');
                    if (reqInput && !reqInput.value) reqInput.value = currentUser.fullName || '';
                    
                    const depInput = document.getElementById('mobile_pos_department');
                    if (depInput && !depInput.value) depInput.value = currentUser.department || '';
                }

                // Populate mobile approver dropdown
                populateApproversDropdown('mobile_pos_approver');

                // Recalculate mobile totals
                updatePOSLaborCost(true);
            } else {
                backdrop.classList.add('hidden');
                if (posCart && posCart.length > 0) {
                    bottomSheet.classList.remove('translate-y-full');
                    bottomSheet.classList.remove('translate-y-0');
                    bottomSheet.classList.add('translate-y-[calc(100%-80px)]');
                } else {
                    bottomSheet.classList.remove('translate-y-[calc(100%-80px)]');
                    bottomSheet.classList.remove('translate-y-0');
                    bottomSheet.classList.add('translate-y-full');
                }
                if (chevron) {
                    chevron.classList.remove('fa-chevron-down');
                    chevron.classList.add('fa-chevron-up');
                }
            }
        }

        // ตารางอัตราค่าแรงซ่อมตามรุ่นเครื่องจักรและระดับงานซ่อม (Repair Labor Rates Matrix)
        const REPAIR_LABOR_RATES = {
            'A1': { 'Under-counter': 2000, 'hood type': 2500, 'Conveyor': 3000 },
            'A2': { 'Under-counter': 3000, 'hood type': 3500, 'Conveyor': 4500 },
            'B1': { 'Under-counter': 3500, 'hood type': 4000, 'Conveyor': 5500 },
            'B2': { 'Under-counter': 4000, 'hood type': 4500, 'Conveyor': 6000 },
            'C1': { 'Under-counter': 6500, 'hood type': 7500, 'Conveyor': 9500 },
            'C2': { 'Under-counter': 7500, 'hood type': 8500, 'Conveyor': 10500 }
        };

        async function fetchApproversAsync(selectId, defaultVal) {
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'getApprovers' })
                });
                const result = await res.json();
                if (result.status === 'success' && Array.isArray(result.data) && result.data.length > 0) {
                    if (!db) db = {};
                    db.approvers = result.data;
                    const select = document.getElementById(selectId);
                    if (select) {
                        select.innerHTML = '<option value="">-- เลือกผู้อนุมัติ --</option>';
                        db.approvers.forEach(appr => {
                            const val = `${appr.fullName}|${appr.email}`;
                            const isSelected = (defaultVal && (appr.email === defaultVal || appr.fullName === defaultVal || val === defaultVal)) ? 'selected' : '';
                            const deptStr = appr.department ? ` - ${appr.department}` : '';
                            select.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(val)}" ${isSelected}>${escapeHTML(appr.fullName)}${escapeHTML(deptStr)}</option>`);
                        });
                    }
                }
            } catch (e) {
                console.error("fetchApproversAsync error:", e);
            }
        }

        function populateApproversDropdown(selectId, defaultVal) {
            const select = document.getElementById(selectId);
            if (!select) return;
            
            select.innerHTML = '<option value="">-- เลือกผู้อนุมัติ --</option>';
            const approvers = (db && Array.isArray(db.approvers)) ? db.approvers : [];
            
            if (approvers.length === 0) {
                if (typeof currentUser !== 'undefined' && currentUser && currentUser.canApprove) {
                    select.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(currentUser.fullName)}|${escapeHTML(currentUser.email)}" selected>${escapeHTML(currentUser.fullName)} (${escapeHTML(currentUser.department || 'ผู้ใช้งาน')})</option>`);
                }
                fetchApproversAsync(selectId, defaultVal);
                return;
            }
            
            approvers.forEach(appr => {
                const val = `${appr.fullName}|${appr.email}`;
                const isSelected = (defaultVal && (appr.email === defaultVal || appr.fullName === defaultVal || val === defaultVal)) ? 'selected' : '';
                const deptStr = appr.department ? ` - ${appr.department}` : '';
                select.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(val)}" ${isSelected}>${escapeHTML(appr.fullName)}${escapeHTML(deptStr)}</option>`);
            });
        }

        function onPOSCustomerTypeChange(isMobile) {
            const custTypeEl = document.getElementById(isMobile ? 'mobile_pos_customer_type' : 'pos_customer_type');
            const priceTierEl = document.getElementById(isMobile ? 'mobile_pos_price_tier' : 'pos_price_tier');
            if (!custTypeEl || !priceTierEl) return;
            
            const custType = custTypeEl.value;
            if (custType === 'ลูกค้าภายใน') {
                priceTierEl.value = 'ต้นทุน';
            } else if (custType === 'ลูกค้าในเครือ') {
                priceTierEl.value = 'ราคาในเครือ';
            } else if (custType === 'ลูกค้าตัวแทน') {
                priceTierEl.value = 'ราคาตัวแทน';
            } else {
                priceTierEl.value = 'ราคากลาง';
            }
            
            onPOSPriceTierChange(isMobile);
        }

        function onPOSPriceTierChange(isMobile) {
            const priceTierEl = document.getElementById(isMobile ? 'mobile_pos_price_tier' : 'pos_price_tier');
            if (!priceTierEl) return;
            const tier = priceTierEl.value;
            
            // Sync desktop and mobile tier inputs if both present
            const otherTierEl = document.getElementById(isMobile ? 'pos_price_tier' : 'mobile_pos_price_tier');
            if (otherTierEl && otherTierEl.value !== tier) {
                otherTierEl.value = tier;
            }
            
            // Recalculate price for all items in cart according to selected tier
            if (Array.isArray(posCart) && db && Array.isArray(db.products)) {
                posCart.forEach(item => {
                    const p = db.products.find(x => x.id == item.id);
                    if (p) {
                        const costVal = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
                        if (tier === 'ต้นทุน') {
                            item.price = costVal;
                        } else if (tier === 'ราคาในเครือ') {
                            item.price = parseFloat(p.price_c) > 0 ? parseFloat(p.price_c) : (costVal * 1.3);
                        } else if (tier === 'ราคาตัวแทน') {
                            item.price = parseFloat(p.price_b) > 0 ? parseFloat(p.price_b) : (costVal * 1.7);
                        } else { // ราคากลาง
                            item.price = parseFloat(p.price_a) > 0 ? parseFloat(p.price_a) : (costVal * 2.1);
                        }
                    }
                });
            }
            
            updatePOSCartUI();
            updatePOSLaborCost(isMobile);
        }

        function onPOSMachineModelChange(isMobile) {
            const modelEl = document.getElementById(isMobile ? 'mobile_pos_machine_model' : 'pos_machine_model');
            const otherEl = document.getElementById(isMobile ? 'mobile_pos_machine_model_other' : 'pos_machine_model_other');
            const otherWrap = isMobile ? document.getElementById('mobile_pos_machine_model_other_wrap') : null;
            const customWrap = document.getElementById(isMobile ? 'mobile_pos_labor_cost_custom_wrap' : 'pos_labor_cost_custom_wrap');
            
            if (!modelEl) return;
            const isOther = (modelEl.value === 'อื่นๆ');
            
            if (isOther) {
                if (otherWrap) otherWrap.classList.remove('hidden');
                if (otherEl) otherEl.classList.remove('hidden');
                if (customWrap) customWrap.classList.remove('hidden');
            } else {
                if (otherWrap) otherWrap.classList.add('hidden');
                if (otherEl) {
                    otherEl.classList.add('hidden');
                    otherEl.value = '';
                }
                if (customWrap) customWrap.classList.add('hidden');
            }
            
            updatePOSLaborCost(isMobile);
        }

        function onPOSRepairLevelChange(isMobile) {
            updatePOSLaborCost(isMobile);
        }

        function onPOSCustomLaborCostChange(isMobile) {
            updatePOSLaborCost(isMobile);
        }

        function updatePOSLaborCost(isMobile) {
            const modelEl = document.getElementById(isMobile ? 'mobile_pos_machine_model' : 'pos_machine_model');
            const levelEl = document.getElementById(isMobile ? 'mobile_pos_repair_level' : 'pos_repair_level');
            const customLaborEl = document.getElementById(isMobile ? 'mobile_pos_labor_cost_custom' : 'pos_labor_cost_custom');
            
            const descEl = document.getElementById(isMobile ? 'mobile_pos_labor_rate_desc' : 'pos_labor_rate_desc');
            const displayLaborEl = document.getElementById(isMobile ? 'mobile_pos_labor_cost_display' : 'pos_labor_cost_display');
            const partsSubtotalEl = document.getElementById(isMobile ? 'mobile_pos_parts_subtotal' : 'pos_parts_subtotal');
            const partsCountEl = document.getElementById('pos_parts_count');
            const grandTotalEl = document.getElementById(isMobile ? 'mobile_pos_grand_total_display' : 'pos_grand_total_display');
            
            const model = modelEl ? modelEl.value : '';
            const level = levelEl ? levelEl.value : '';
            
            let laborRate = 0;
            let rateDesc = 'ยังไม่ระบุ';
            
            if (model === 'อื่นๆ') {
                const customVal = customLaborEl ? parseFloat(customLaborEl.value) : 0;
                laborRate = isNaN(customVal) ? 0 : customVal;
                rateDesc = level ? `อื่นๆ (${level})` : 'อื่นๆ';
            } else if (model && level && REPAIR_LABOR_RATES[level] && REPAIR_LABOR_RATES[level][model] !== undefined) {
                laborRate = REPAIR_LABOR_RATES[level][model];
                rateDesc = `${model} | ${level}`;
            } else if (level) {
                rateDesc = `ระดับ ${level}`;
            } else if (model) {
                rateDesc = model;
            }
            
            if (descEl) descEl.textContent = rateDesc;
            if (displayLaborEl) {
                displayLaborEl.textContent = '฿' + laborRate.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            
            // Parts Subtotal
            let partsSubtotal = 0;
            let partsQty = 0;
            if (Array.isArray(posCart)) {
                posCart.forEach(it => {
                    partsSubtotal += (it.price * it.qty);
                    partsQty += it.qty;
                });
            }
            
            if (partsSubtotalEl) {
                partsSubtotalEl.textContent = '฿' + partsSubtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            if (partsCountEl) {
                partsCountEl.textContent = partsQty;
            }
            
            const grandTotal = partsSubtotal + laborRate;
            if (grandTotalEl) {
                grandTotalEl.textContent = '฿' + grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        }

        let html5QrCode = null;
        let activeCameraId = "";
        let cameraList = [];

        function openCameraScanner() {
            document.getElementById('cameraScannerModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            
            const selectEl = document.getElementById('cameraSelect');
            selectEl.innerHTML = '<option value="">กำลังดึงข้อมูลกล้อง...</option>';
            
            Html5Qrcode.getCameras().then(devices => {
                if (devices && devices.length > 0) {
                    cameraList = devices;
                    selectEl.innerHTML = '';
                    devices.forEach((device, index) => {
                        let label = device.label || `กล้อง ${index + 1}`;
                        selectEl.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(device.id)}">${escapeHTML(label)}</option>`);
                    });
                    
                    let defaultCamera = devices[0].id;
                    const backCam = devices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment') || device.label.toLowerCase().includes('หลัง'));
                    if (backCam) {
                        defaultCamera = backCam.id;
                    }
                    
                    selectEl.value = defaultCamera;
                    startCamera(defaultCamera);
                } else {
                    selectEl.innerHTML = '<option value="">ไม่พบอุปกรณ์กล้อง</option>';
                    showToast("ไม่พบอุปกรณ์กล้องบนเครื่องนี้", "error");
                }
            }).catch(err => {
                console.error(err);
                selectEl.innerHTML = '<option value="">ไม่มีสิทธิ์เข้าถึงกล้อง</option>';
                showToast("ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์เข้าถึงกล้องในเบราว์เซอร์", "error");
            });
        }

        function startCamera(cameraId) {
            if (html5QrCode) {
                html5QrCode.stop().then(() => {
                    _startCameraInstance(cameraId);
                }).catch(err => {
                    console.error("Error stopping scanner before restart:", err);
                    _startCameraInstance(cameraId);
                });
            } else {
                _startCameraInstance(cameraId);
            }
        }

        function _startCameraInstance(cameraId) {
            activeCameraId = cameraId;
            html5QrCode = new Html5Qrcode("qr-reader");
            
            const config = {
                fps: 10,
                qrbox: (width, height) => {
                    const size = Math.min(width, height) * 0.7;
                    return { width: size, height: size };
                },
                aspectRatio: 1.0
            };
            
            html5QrCode.start(
                cameraId, 
                config,
                (decodedText, decodedResult) => {
                    const scannedCode = decodedText.trim();
                    if (scannedCode) {
                        if (typeof showToast === 'function') {
                            showToast(`สแกนรหัส "${scannedCode}" สำเร็จ`, "success");
                        }
                        
                        closeCameraScanner();
                        
                        const p = db.products.find(x => String(x.id).toLowerCase() === scannedCode.toLowerCase());
                        if (p) {
                            showPOSQuantityPopup(p.id);
                        } else {
                            showToast(`ไม่พบรหัสสินค้า "${scannedCode}" ในระบบ`, "error");
                        }
                    }
                },
                (errorMessage) => {
                    // Verbose error logging
                }
            ).catch(err => {
                console.error("Error starting camera scanner:", err);
                showToast("เริ่มกล้องสแกนไม่สำเร็จ", "error");
            });
        }

        function switchCamera(cameraId) {
            if (cameraId) {
                startCamera(cameraId);
            }
        }

        function closeCameraScanner() {
            document.getElementById('cameraScannerModal').classList.add('hidden');
            document.body.style.overflow = '';
            
            if (html5QrCode) {
                html5QrCode.stop().then(() => {
                    html5QrCode = null;
                }).catch(err => {
                    console.error("Error stopping camera scanner:", err);
                    html5QrCode = null;
                });
            }
        }

        async function submitPOSCheckout(e) {
            e.preventDefault();
            if (posCart.length === 0) return;
            
            const requester = document.getElementById('pos_requester').value.trim();
            const approverVal = document.getElementById('pos_approver').value.trim();
            const machineId = document.getElementById('pos_machine').value.trim();
            const serialNumber = document.getElementById('pos_serial_number').value.trim();
            const note = document.getElementById('pos_note').value.trim();
            const jobDetails = getSelectedJobDetails(false);

            const customerType = document.getElementById('pos_customer_type')?.value || 'ลูกค้าภายนอก';
            const priceTier = document.getElementById('pos_price_tier')?.value || 'ราคากลาง';
            const machineModelSelect = document.getElementById('pos_machine_model')?.value || '';
            const machineModelOther = document.getElementById('pos_machine_model_other')?.value.trim() || '';
            const machineModel = (machineModelSelect === 'อื่นๆ') ? (machineModelOther || 'อื่นๆ') : machineModelSelect;
            const repairLevel = document.getElementById('pos_repair_level')?.value || '';

            if (!requester) {
                showToast("กรุณาระบุชื่อผู้ประเมินซ่อม", "error");
                return;
            }
            if (!approverVal) {
                showToast("กรุณาเลือกผู้อนุมัติ", "error");
                return;
            }
            if (!machineId) {
                showToast("กรุณาระบุเครื่องจักร", "error");
                return;
            }
            if (!serialNumber) {
                showToast("กรุณาระบุ Serial Number", "error");
                return;
            }
            if (!note) {
                showToast("กรุณาระบุวัตถุประสงค์ในการเบิก / หมายเหตุ", "error");
                return;
            }
            if (!machineModelSelect) {
                showToast("กรุณาเลือก Machine model", "error");
                return;
            }
            if (machineModelSelect === 'อื่นๆ' && !machineModelOther) {
                showToast("กรุณาระบุชื่อ Machine model อื่นๆ", "error");
                return;
            }
            if (!repairLevel) {
                showToast("กรุณาเลือกระดับงานซ่อม", "error");
                return;
            }

            const approverParts = approverVal.split('|');
            const approverName = approverParts[0] || approverVal;
            const approverEmail = approverParts[1] || '';

            let laborRate = 0;
            if (machineModelSelect === 'อื่นๆ') {
                const customEl = document.getElementById('pos_labor_cost_custom');
                laborRate = customEl ? (parseFloat(customEl.value) || 0) : 0;
            } else if (REPAIR_LABOR_RATES[repairLevel] && REPAIR_LABOR_RATES[repairLevel][machineModelSelect] !== undefined) {
                laborRate = REPAIR_LABOR_RATES[repairLevel][machineModelSelect];
            }
            
            let partsTotal = 0;
            const cartItems = posCart.map(item => {
                partsTotal += item.price * item.qty;
                return {
                    id: item.id,
                    qty: item.qty,
                    price: item.price,
                    priceLevel: priceTier
                };
            });

            const grandTotal = partsTotal + laborRate;
            
            const payload = {
                requester: requester,
                department: document.getElementById('pos_department').value.trim() || (currentUser?.department || ''),
                approver: approverName,
                approver_email: approverEmail,
                customer_type: customerType,
                price_tier: priceTier,
                machine_model: machineModel,
                repair_level: repairLevel,
                labor_cost: laborRate,
                parts_total: partsTotal,
                machine_id: machineId,
                serial_number: serialNumber,
                note: note,
                job_details: jobDetails,
                total_price: grandTotal,
                approval_status: 'Pending',
                cart: cartItems
            };
            
            showLoading('กำลังบันทึกรายการและปรับปรุงสต็อก...');
            try {
                let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'checkoutOrder', payload: payload }) });
                let result = await res.json();
                
                if (result.status === 'success') {
                    closePOSCheckoutModal();
                    clearPOSCart();
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'ทำรายการเบิกจ่ายสำเร็จ!',
                        html: `เลขที่ใบเบิก: <strong class="text-blue-600">${result.data.transaction_id}</strong><br>ระบบได้บันทึกข้อมูลและปรับปรุงสต็อกเรียบร้อยแล้ว`,
                        showDenyButton: true,
                        confirmButtonText: '<i class="fa-solid fa-print"></i> พิมพ์ใบเบิก (สลิป)',
                        denyButtonText: 'ปิดหน้าต่าง',
                        confirmButtonColor: '#10b981',
                        denyButtonColor: '#6e7881',
                        customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold' }
                    }).then((swalRes) => {
                        if (swalRes.isConfirmed) {
                            const now = new Date();
                            const yyyy = now.getFullYear();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            const hh = String(now.getHours()).padStart(2, '0');
                            const min = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            const dateStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

                            const printedTx = {
                                id: result.data.transaction_id,
                                date: dateStr,
                                requester: requester,
                                department: payload.department,
                                approver: approverName,
                                customer_type: customerType,
                                price_tier: priceTier,
                                machine_model: machineModel,
                                repair_level: repairLevel,
                                labor_cost: laborRate,
                                parts_total: partsTotal,
                                machine_id: machineId,
                                serial_number: serialNumber,
                                note: note,
                                job_details: jobDetails,
                                total_price: grandTotal,
                                items: cartItems.map(item => ({
                                    product_id: item.id,
                                    qty: item.qty,
                                    price: item.price
                                }))
                            };
                            printPOSSlip(printedTx);
                        }
                        switchView('view-transactions');
                        loadTransactions();
                    });
                    
                    await fetchData(false);
                    renderPOSGrid();
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อบันทึกรายการได้', 'error');
            }
            hideLoading();
        }

        async function submitMobilePOSCheckout() {
            if (posCart.length === 0) return;
            
            const requester = document.getElementById('mobile_pos_requester').value.trim();
            const approverVal = document.getElementById('mobile_pos_approver').value.trim();
            const machineId = document.getElementById('mobile_pos_machine').value.trim();
            const serialNumber = document.getElementById('mobile_pos_serial_number').value.trim();
            const note = document.getElementById('mobile_pos_note').value.trim();
            const jobDetails = getSelectedJobDetails(true);

            const customerType = document.getElementById('mobile_pos_customer_type')?.value || 'ลูกค้าภายนอก';
            const priceTier = document.getElementById('mobile_pos_price_tier')?.value || 'ราคากลาง';
            const machineModelSelect = document.getElementById('mobile_pos_machine_model')?.value || '';
            const machineModelOther = document.getElementById('mobile_pos_machine_model_other')?.value.trim() || '';
            const machineModel = (machineModelSelect === 'อื่นๆ') ? (machineModelOther || 'อื่นๆ') : machineModelSelect;
            const repairLevel = document.getElementById('mobile_pos_repair_level')?.value || '';
            
            if (!requester) {
                showToast("กรุณาระบุชื่อผู้ประเมินซ่อม", "error");
                return;
            }
            if (!approverVal) {
                showToast("กรุณาเลือกผู้อนุมัติ", "error");
                return;
            }
            if (!machineId) {
                showToast("กรุณาระบุเครื่องจักร", "error");
                return;
            }
            if (!serialNumber) {
                showToast("กรุณาระบุ Serial Number", "error");
                return;
            }
            if (!note) {
                showToast("กรุณาระบุวัตถุประสงค์การเบิก / หมายเหตุ", "error");
                return;
            }
            if (!machineModelSelect) {
                showToast("กรุณาเลือก Machine model", "error");
                return;
            }
            if (machineModelSelect === 'อื่นๆ' && !machineModelOther) {
                showToast("กรุณาระบุชื่อ Machine model อื่นๆ", "error");
                return;
            }
            if (!repairLevel) {
                showToast("กรุณาเลือกระดับงานซ่อม", "error");
                return;
            }

            const approverParts = approverVal.split('|');
            const approverName = approverParts[0] || approverVal;
            const approverEmail = approverParts[1] || '';

            let laborRate = 0;
            if (machineModelSelect === 'อื่นๆ') {
                const customEl = document.getElementById('mobile_pos_labor_cost_custom');
                laborRate = customEl ? (parseFloat(customEl.value) || 0) : 0;
            } else if (REPAIR_LABOR_RATES[repairLevel] && REPAIR_LABOR_RATES[repairLevel][machineModelSelect] !== undefined) {
                laborRate = REPAIR_LABOR_RATES[repairLevel][machineModelSelect];
            }
            
            let partsTotal = 0;
            const cartItems = posCart.map(item => {
                partsTotal += item.price * item.qty;
                return {
                    id: item.id,
                    qty: item.qty,
                    price: item.price,
                    priceLevel: priceTier
                };
            });

            const grandTotal = partsTotal + laborRate;
            
            const payload = {
                requester: requester,
                department: document.getElementById('mobile_pos_department').value.trim() || (currentUser?.department || ''),
                approver: approverName,
                approver_email: approverEmail,
                customer_type: customerType,
                price_tier: priceTier,
                machine_model: machineModel,
                repair_level: repairLevel,
                labor_cost: laborRate,
                parts_total: partsTotal,
                machine_id: machineId,
                serial_number: serialNumber,
                note: note,
                job_details: jobDetails,
                total_price: grandTotal,
                approval_status: 'Pending',
                cart: cartItems
            };
            
            showLoading('กำลังบันทึกรายการและปรับปรุงสต็อก...');
            try {
                let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'checkoutOrder', payload: payload }) });
                let result = await res.json();
                
                if (result.status === 'success') {
                    // Reset mobile inputs
                    document.getElementById('mobile_pos_requester').value = '';
                    document.getElementById('mobile_pos_approver').value = '';
                    document.getElementById('mobile_pos_machine').value = '';
                    document.getElementById('mobile_pos_serial_number').value = '';
                    document.getElementById('mobile_pos_note').value = '';
                    resetJobDetails(true);
                    
                    isMobileCartOpen = false;
                    toggleMobileCart(false);
                    clearPOSCart();
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'บันทึกใบเบิกสำเร็จ!',
                        html: `เลขที่ใบเบิก: <strong class="text-blue-600">${result.data.transaction_id}</strong><br>ระบบได้ปรับปรุงยอดคงเหลือในสต็อกเรียบร้อยแล้ว`,
                        showDenyButton: true,
                        confirmButtonText: '<i class="fa-solid fa-print"></i> พิมพ์ใบเบิก (สลิป)',
                        denyButtonText: 'ปิดหน้าต่าง',
                        confirmButtonColor: '#10b981',
                        denyButtonColor: '#6e7881'
                    }).then((swalRes) => {
                        if (swalRes.isConfirmed) {
                            const now = new Date();
                            const yyyy = now.getFullYear();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            const hh = String(now.getHours()).padStart(2, '0');
                            const min = String(now.getMinutes()).padStart(2, '0');
                            const ss = String(now.getSeconds()).padStart(2, '0');
                            const dateStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

                            const printedTx = {
                                id: result.data.transaction_id,
                                date: dateStr,
                                requester: requester,
                                department: payload.department,
                                approver: approverName,
                                customer_type: customerType,
                                price_tier: priceTier,
                                machine_model: machineModel,
                                repair_level: repairLevel,
                                labor_cost: laborRate,
                                parts_total: partsTotal,
                                machine_id: machineId,
                                serial_number: serialNumber,
                                note: note,
                                job_details: jobDetails,
                                total_price: grandTotal,
                                items: cartItems.map(item => ({
                                    product_id: item.id,
                                    qty: item.qty,
                                    price: item.price
                                }))
                            };
                            printPOSSlip(printedTx);
                        }
                        switchView('view-transactions');
                        loadTransactions();
                    });
                    await fetchData(false);
                    renderPOSGrid();
                } else {
                    showToast(result.message || 'บันทึกข้อมูลไม่สำเร็จ', 'error');
                }
            } catch (e) {
                console.error(e);
                showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
            }
            hideLoading();
        }


        // ===== Document Approval System (ระบบอนุมัติเอกสารเบิกจ่าย) =====
        let currentApprovalSelectedTxId = null;
        let currentApprovalEditingItems = [];
        let hasApprovalItemsChanged = false;

        function getProductPriceByTier(p, tier) {
            if (!p) return 0;
            const costVal = parseFloat(String(p.cost).replace(/,/g, '')) || 0;
            if (tier === 'ต้นทุน') return costVal;
            if (tier === 'ราคาในเครือ') return parseFloat(p.price_c) > 0 ? parseFloat(p.price_c) : (costVal * 1.3);
            if (tier === 'ราคาตัวแทน') return parseFloat(p.price_b) > 0 ? parseFloat(p.price_b) : (costVal * 1.7);
            return parseFloat(p.price_a) > 0 ? parseFloat(p.price_a) : (costVal * 2.1);
        }

        function updateApprovalBadge() {
            const badge = document.getElementById('approvalPendingBadge');
            if (!badge) return;
            if (!isLoggedIn || !currentUser || !hasAccess('view-approval')) {
                badge.classList.add('hidden');
                return;
            }

            let pendingCount = 0;
            if (Array.isArray(transactions)) {
                if (currentUser.role === 'ADMIN') {
                    pendingCount = transactions.filter(t => t.status !== 'Restock' && t.status !== 'Cancelled' && (t.approval_status === 'Pending' || (!t.approval_status && t.status === 'Success'))).length;
                } else if (currentUser.canApprove) {
                    pendingCount = transactions.filter(t => {
                        if (t.status === 'Restock' || t.status === 'Cancelled') return false;
                        if (t.approval_status && t.approval_status !== 'Pending') return false;
                        const matchEmail = t.approver_email && currentUser.email && t.approver_email.toLowerCase() === currentUser.email.toLowerCase();
                        const matchName = t.approver && currentUser.fullName && t.approver.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase();
                        return matchEmail || matchName;
                    }).length;
                }
            }

            if (pendingCount > 0) {
                badge.textContent = pendingCount > 99 ? '99+' : pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        async function initApprovalView(forceRefresh = false) {
            if (!hasAccess('view-approval')) {
                showToast("คุณไม่มีสิทธิ์เข้าถึงหน้านี้", "error");
                switchView('view-catalog');
                return;
            }

            const subtitleEl = document.getElementById('approvalViewSubtitle');
            if (subtitleEl && currentUser) {
                if (currentUser.role === 'ADMIN') {
                    subtitleEl.innerHTML = `<span class="inline-flex items-center gap-1 text-blue-600 font-semibold"><i class="fa-solid fa-shield-halved"></i> สิทธิ์ผู้ดูแลระบบ (Admin):</span> สามารถตรวจสอบและพิจารณาอนุมัติ/ไม่อนุมัติใบขอเบิกอะไหล่ทั้งหมด`;
                } else {
                    subtitleEl.innerHTML = `<span class="inline-flex items-center gap-1 text-emerald-600 font-semibold"><i class="fa-solid fa-stamp"></i> สิทธิ์ผู้อนุมัติ:</span> แสดงเฉพาะใบขอเบิกที่ส่งถึงคุณ (<strong class="text-slate-800">${escapeHTML(currentUser.fullName)}</strong>)`;
                }
            }

            // Populate Admin Approver Filter dropdown if ADMIN
            const adminFilterWrap = document.getElementById('adminApprovalFilterWrap');
            const adminApproverSelect = document.getElementById('filterApprovalApprover');
            if (adminFilterWrap && adminApproverSelect) {
                if (currentUser.role === 'ADMIN') {
                    adminFilterWrap.classList.remove('hidden');
                    const currentSelected = adminApproverSelect.value || 'all';
                    
                    // Collect unique approvers
                    const approverSet = new Set();
                    (transactions || []).forEach(t => {
                        if (t.approver && t.status !== 'Restock') {
                            approverSet.add(t.approver.trim());
                        }
                    });

                    let optionsHtml = '<option value="all">-- ดูผู้อนุมัติทุกคน --</option>';
                    Array.from(approverSet).sort().forEach(appr => {
                        optionsHtml += `<option value="${escapeHTML(appr)}" ${appr === currentSelected ? 'selected' : ''}>👤 ${escapeHTML(appr)}</option>`;
                    });
                    adminApproverSelect.innerHTML = optionsHtml;
                } else {
                    adminFilterWrap.classList.add('hidden');
                }
            }

            if (forceRefresh || !transactions || transactions.length === 0) {
                showLoading('กำลังโหลดรายการขออนุมัติเอกสาร...');
                try {
                    let transRes = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getTransactions' }) });
                    let result = await transRes.json();
                    if (result.status === 'success') {
                        transactions = result.data || [];
                    } else {
                        showToast('ดึงข้อมูลเอกสารไม่สำเร็จ: ' + result.message, 'error');
                    }
                } catch (err) {
                    showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อดึงข้อมูลได้', 'error');
                }
                hideLoading();
            }

            renderApprovalTable();
            updateApprovalBadge();
        }

        function setApprovalStatusFilter(status) {
            const selectEl = document.getElementById('filterApprovalStatus');
            if (selectEl) {
                selectEl.value = status;
                renderApprovalTable();
            }
        }

        function getScopedApprovalTransactions() {
            if (!Array.isArray(transactions)) return [];
            let list = transactions.filter(t => t.status !== 'Restock');

            if (!currentUser || currentUser.role !== 'ADMIN') {
                list = list.filter(t => {
                    const matchEmail = t.approver_email && currentUser?.email && t.approver_email.toLowerCase() === currentUser.email.toLowerCase();
                    const matchName = t.approver && currentUser?.fullName && t.approver.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase();
                    return matchEmail || matchName;
                });
            } else {
                const adminFilterApprover = document.getElementById('filterApprovalApprover')?.value || 'all';
                if (adminFilterApprover !== 'all') {
                    list = list.filter(t => t.approver && t.approver.trim() === adminFilterApprover);
                }
            }
            return list;
        }

        function renderApprovalTable() {
            const tbody = document.getElementById('approvalTableBody');
            if (!tbody) return;

            const searchInput = document.getElementById('searchApprovalInput')?.value.toLowerCase().trim() || '';
            const searchWords = searchInput ? searchInput.split(/\s+/) : [];
            const statusFilter = document.getElementById('filterApprovalStatus')?.value || 'all';

            const scopedTransactions = getScopedApprovalTransactions();

            // Calculate Statistics
            let countPending = 0;
            let countApproved = 0;
            let countRejected = 0;
            let countTotal = scopedTransactions.length;

            scopedTransactions.forEach(t => {
                const appStatus = t.approval_status || (t.status === 'Cancelled' ? 'Rejected' : 'Pending');
                if (appStatus === 'Approved') countApproved++;
                else if (appStatus === 'Rejected' || t.status === 'Cancelled') countRejected++;
                else countPending++;
            });

            const statPendingEl = document.getElementById('approval_stat_pending');
            if (statPendingEl) statPendingEl.textContent = `${countPending.toLocaleString()} รายการ`;
            const statApprovedEl = document.getElementById('approval_stat_approved');
            if (statApprovedEl) statApprovedEl.textContent = `${countApproved.toLocaleString()} รายการ`;
            const statRejectedEl = document.getElementById('approval_stat_rejected');
            if (statRejectedEl) statRejectedEl.textContent = `${countRejected.toLocaleString()} รายการ`;
            const statTotalEl = document.getElementById('approval_stat_total');
            if (statTotalEl) statTotalEl.textContent = `${countTotal.toLocaleString()} รายการ`;

            // Filter by search keywords and status
            const filtered = scopedTransactions.filter(t => {
                const appStatus = t.approval_status || (t.status === 'Cancelled' ? 'Rejected' : 'Pending');

                if (statusFilter !== 'all') {
                    if (statusFilter === 'Pending' && appStatus !== 'Pending') return false;
                    if (statusFilter === 'Approved' && appStatus !== 'Approved') return false;
                    if (statusFilter === 'Rejected' && appStatus !== 'Rejected' && t.status !== 'Cancelled') return false;
                }

                if (searchWords.length > 0) {
                    const searchTarget = `${t.id} ${t.requester} ${t.approver} ${t.machine_id} ${t.machine_model} ${t.serial_number} ${t.note}`.toLowerCase();
                    return searchWords.every(word => searchTarget.includes(word));
                }
                return true;
            });

            tbody.innerHTML = '';
            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" class="p-12 text-center text-slate-400"><i class="fa-solid fa-file-circle-xmark text-4xl mb-3 opacity-30 block"></i>ไม่พบเอกสารขออนุมัติที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
                return;
            }

            filtered.forEach((t, index) => {
                const appStatus = t.approval_status || (t.status === 'Cancelled' ? 'Rejected' : 'Pending');
                let statusBadge = '';
                let actionBtn = '';

                if (appStatus === 'Approved') {
                    statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm"><i class="fa-solid fa-circle-check text-emerald-600"></i> อนุมัติแล้ว</span>`;
                    actionBtn = `
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="openApprovalModal('${escapeForJS(t.id)}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1"><i class="fa-solid fa-eye"></i> ดูข้อมูล</button>
                            <button onclick="printPOSSlipById('${escapeForJS(t.id)}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition" title="พิมพ์ใบเบิก"><i class="fa-solid fa-print"></i></button>
                        </div>
                    `;
                } else if (appStatus === 'Rejected' || t.status === 'Cancelled') {
                    statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-sm"><i class="fa-solid fa-circle-xmark text-rose-600"></i> ไม่อนุมัติ</span>`;
                    actionBtn = `
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="openApprovalModal('${escapeForJS(t.id)}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition inline-flex items-center gap-1"><i class="fa-solid fa-eye"></i> ดูข้อมูล</button>
                        </div>
                    `;
                } else {
                    statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm animate-pulse"><i class="fa-solid fa-hourglass-half text-amber-600"></i> รออนุมัติ</span>`;
                    actionBtn = `
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="openApprovalModal('${escapeForJS(t.id)}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition inline-flex items-center gap-1 active:scale-95"><i class="fa-solid fa-file-signature"></i> พิจารณา</button>
                            <button onclick="printPOSSlipById('${escapeForJS(t.id)}')" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition" title="พิมพ์ใบเบิก"><i class="fa-solid fa-print"></i></button>
                        </div>
                    `;
                }

                const machineInfo = t.machine_model ? `${escapeHTML(t.machine_id || '')} <span class="text-[10px] text-slate-500 block font-normal">(${escapeHTML(t.machine_model)})</span>` : escapeHTML(t.machine_id || '-');
                const repairLevelBadge = t.repair_level ? `<span class="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">${escapeHTML(t.repair_level)}</span>` : '-';
                const totalPriceFormatted = Number(t.total_price || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                const tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-gray-100 last:border-0 ${appStatus === 'Pending' ? 'bg-amber-50/20' : ''}">
                        <td class="p-4 text-center text-gray-400 font-medium">${index + 1}</td>
                        <td class="p-4 font-bold text-slate-900">
                            <a href="#" onclick="openApprovalModal('${escapeForJS(t.id)}'); return false;" class="text-blue-600 hover:underline flex items-center gap-1">
                                <i class="fa-solid fa-receipt text-xs opacity-60"></i> ${escapeHTML(t.id)}
                            </a>
                        </td>
                        <td class="p-4 text-gray-500 text-xs font-semibold">${escapeHTML(t.date || '-')}</td>
                        <td class="p-4 text-slate-800 font-bold">${escapeHTML(t.requester || '-')}</td>
                        <td class="p-4">
                            <span class="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                                <i class="fa-solid fa-stamp text-[10px]"></i> ${escapeHTML(t.approver || '-')}
                            </span>
                        </td>
                        <td class="p-4 text-slate-700 text-xs font-medium">${machineInfo}</td>
                        <td class="p-4 text-center">${repairLevelBadge}</td>
                        <td class="p-4 text-right font-black text-emerald-700">฿${totalPriceFormatted}</td>
                        <td class="p-4 text-center">${statusBadge}</td>
                        <td class="p-4 text-center">${actionBtn}</td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            });
        }

        function openApprovalModal(txId) {
            const t = (transactions || []).find(x => x.id === txId);
            if (!t) {
                showToast("ไม่พบข้อมูลเอกสาร", "error");
                return;
            }

            currentApprovalSelectedTxId = txId;
            const appStatus = t.approval_status || (t.status === 'Cancelled' ? 'Rejected' : 'Pending');

            document.getElementById('aam_tx_id').textContent = `เลขที่ใบเบิก: ${t.id}`;
            document.getElementById('aam_date').textContent = t.date || '-';
            document.getElementById('aam_requester').textContent = t.requester || '-';
            document.getElementById('aam_approver').textContent = t.approver || '-';
            document.getElementById('aam_repair_level').textContent = t.repair_level || '-';
            document.getElementById('aam_customer_type').textContent = t.customer_type || '-';
            document.getElementById('aam_price_tier').textContent = t.price_tier || '-';
            document.getElementById('aam_machine').textContent = t.machine_id || '-';
            document.getElementById('aam_machine_detail').textContent = `${t.machine_model || '-'} / SN: ${t.serial_number || '-'}`;
            document.getElementById('aam_note').textContent = t.note || '-';

            const aamJobDetailsEl = document.getElementById('aam_job_details');
            if (aamJobDetailsEl) {
                if (t.job_details) {
                    const items = t.job_details.split(',').map(s => s.trim()).filter(Boolean);
                    aamJobDetailsEl.innerHTML = items.map(it => `<span class="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i class="fa-solid fa-check text-[10px] text-blue-600"></i>${escapeHTML(it)}</span>`).join('');
                } else {
                    aamJobDetailsEl.innerHTML = '<span class="text-xs text-slate-400 italic">ไม่ได้ระบุรายละเอียดงาน</span>';
                }
            }

            // Items list initialization
            const isAdmin = currentUser && currentUser.role === 'ADMIN';
            const isApproverUser = currentUser && (
                currentUser.canApprove === true ||
                (t.approver_email && currentUser.email && t.approver_email.toLowerCase() === currentUser.email.toLowerCase()) ||
                (t.approver && currentUser.fullName && t.approver.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase())
            );
            const canEditItems = (isAdmin || isApproverUser) && (appStatus === 'Pending');

            currentApprovalEditingItems = (t.items || []).map(item => ({
                product_id: item.product_id || item.id,
                qty: Number(item.qty) || 1,
                price: Number(item.price) || 0
            }));
            hasApprovalItemsChanged = false;

            // Toggle add part button and actions column header
            const addPartBtn = document.getElementById('aamAddPartBtn');
            if (addPartBtn) {
                if (canEditItems) addPartBtn.classList.remove('hidden');
                else addPartBtn.classList.add('hidden');
            }

            const thActions = document.getElementById('aam_th_actions');
            if (thActions) {
                if (canEditItems) thActions.classList.remove('hidden');
                else thActions.classList.add('hidden');
            }

            // Status Pill & Decision Box
            const pillEl = document.getElementById('aam_status_pill');
            const decisionBox = document.getElementById('aam_decision_box');
            const historyBanner = document.getElementById('aam_history_banner');

            if (appStatus === 'Pending') {
                pillEl.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
                pillEl.innerHTML = '<i class="fa-solid fa-hourglass-half mr-1"></i> รออนุมัติ';
                
                decisionBox.classList.remove('hidden');
                document.getElementById('aam_approval_note').value = '';
                historyBanner.classList.add('hidden');
            } else if (appStatus === 'Approved') {
                pillEl.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                pillEl.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> อนุมัติแล้ว';
                
                decisionBox.classList.add('hidden');
                historyBanner.classList.remove('hidden');
                historyBanner.className = 'p-4 rounded-2xl border text-xs bg-emerald-50 border-emerald-200 text-emerald-950';
                
                document.getElementById('aam_history_title').innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600"></i> อนุมัติรายการเรียบร้อยแล้ว';
                document.getElementById('aam_history_meta').textContent = `ผู้อนุมัติ: ${t.approval_by || t.approver || '-'} | วันเวลา: ${t.approval_date || '-'}`;
                const noteEl = document.getElementById('aam_history_note');
                if (t.approval_note) {
                    noteEl.textContent = `ข้อคิดเห็นผู้อนุมัติ: ${t.approval_note}`;
                    noteEl.classList.remove('hidden');
                } else {
                    noteEl.classList.add('hidden');
                }
            } else {
                pillEl.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30';
                pillEl.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> ไม่อนุมัติ';
                
                decisionBox.classList.add('hidden');
                historyBanner.classList.remove('hidden');
                historyBanner.className = 'p-4 rounded-2xl border text-xs bg-rose-50 border-rose-200 text-rose-950';
                
                document.getElementById('aam_history_title').innerHTML = '<i class="fa-solid fa-circle-xmark text-rose-600"></i> คำขอนี้ไม่ได้รับอนุมัติ (ระบบคืนสต็อกเข้าคลังแล้ว)';
                document.getElementById('aam_history_meta').textContent = `ผู้พิจารณา: ${t.approval_by || t.approver || '-'} | วันเวลา: ${t.approval_date || '-'}`;
                const noteEl = document.getElementById('aam_history_note');
                if (t.approval_note) {
                    noteEl.textContent = `เหตุผลที่ไม่อนุมัติ: ${t.approval_note}`;
                    noteEl.classList.remove('hidden');
                } else {
                    noteEl.classList.add('hidden');
                }
            }

            renderApprovalItemsTable(canEditItems);
            document.getElementById('approvalActionModal').classList.remove('hidden');
        }

        function renderApprovalItemsTable(canEditItems) {
            const tbody = document.getElementById('aamItemsTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            let calcParts = 0;

            if (currentApprovalEditingItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${canEditItems ? 6 : 5}" class="p-6 text-center text-slate-400">ไม่มีรายการอะไหล่</td></tr>`;
            } else {
                currentApprovalEditingItems.forEach((item, idx) => {
                    const prod = (db && Array.isArray(db.products)) ? db.products.find(p => p.id == item.product_id) : null;
                    const prodName = prod ? prod.name : 'ไม่พบชื่อสินค้า';
                    const unit = (prod && prod.unit) ? prod.unit : 'ชิ้น';
                    const subtotal = item.qty * item.price;
                    calcParts += subtotal;

                    const actionCol = canEditItems ? `
                        <td class="p-3 text-center whitespace-nowrap">
                            <div class="flex items-center justify-center gap-1.5">
                                <button type="button" onclick="promptChangeApprovalItem(${idx})" class="p-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm active:scale-95" title="เปลี่ยนอะไหล่ / แก้ไขจำนวน">
                                    <i class="fa-solid fa-pen-to-square text-xs"></i> <span class="hidden sm:inline">เปลี่ยน</span>
                                </button>
                                <button type="button" onclick="deleteApprovalItem(${idx})" class="p-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm active:scale-95" title="ลบรายการ">
                                    <i class="fa-solid fa-trash-can text-xs"></i> <span class="hidden sm:inline">ลบ</span>
                                </button>
                            </div>
                        </td>
                    ` : '';

                    const tr = `
                        <tr class="hover:bg-slate-50 border-b border-gray-100 last:border-0">
                            <td class="p-3 font-semibold text-slate-700">${escapeHTML(item.product_id)}</td>
                            <td class="p-3 font-bold text-slate-900">${escapeHTML(prodName)}</td>
                            <td class="p-3 text-right font-bold text-slate-800">${item.qty.toLocaleString()} ${escapeHTML(unit)}</td>
                            <td class="p-3 text-right font-medium text-slate-600">฿${Number(item.price).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
                            <td class="p-3 text-right font-black text-slate-900">฿${subtotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
                            ${actionCol}
                        </tr>
                    `;
                    tbody.insertAdjacentHTML('beforeend', tr);
                });
            }

            const t = (transactions || []).find(x => x.id === currentApprovalSelectedTxId);
            const laborCost = Number(t?.labor_cost) || 0;
            const grandTotal = calcParts + laborCost;

            document.getElementById('aam_parts_total').textContent = `฿${calcParts.toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
            document.getElementById('aam_labor_cost').textContent = `฿${laborCost.toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
            document.getElementById('aam_total_price').textContent = `฿${grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}`;

            const changedBadge = document.getElementById('aamItemsChangedBadge');
            if (changedBadge) {
                if (hasApprovalItemsChanged) changedBadge.classList.remove('hidden');
                else changedBadge.classList.add('hidden');
            }

            const actionButtonsWrap = document.getElementById('aam_action_buttons');
            if (actionButtonsWrap) {
                const appStatus = t?.approval_status || (t?.status === 'Cancelled' ? 'Rejected' : 'Pending');
                if (appStatus === 'Pending') {
                    const saveBtnHtml = hasApprovalItemsChanged ? `
                        <button id="aamSaveBtn" onclick="handleSaveApprovalItemChanges()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/20 transition font-bold text-sm flex items-center gap-1.5 active:scale-95">
                            <i class="fa-solid fa-save"></i> บันทึกการแก้ไข
                        </button>
                    ` : '';

                    actionButtonsWrap.innerHTML = `
                        <button id="aamRejectBtn" onclick="handleRejectApproval()" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md shadow-rose-600/20 transition font-semibold text-sm flex items-center gap-1.5 active:scale-95">
                            <i class="fa-solid fa-times-circle"></i> ไม่อนุมัติคำขอ
                        </button>
                        ${saveBtnHtml}
                        <button id="aamApproveBtn" onclick="handleApproveApproval()" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/25 transition font-bold text-sm flex items-center gap-1.5 active:scale-95">
                            <i class="fa-solid fa-circle-check"></i> ${hasApprovalItemsChanged ? 'บันทึกและอนุมัติ' : 'อนุมัติคำขอเบิก'}
                        </button>
                    `;
                } else if (appStatus === 'Approved') {
                    actionButtonsWrap.innerHTML = `
                        <button onclick="printPOSSlipById('${escapeForJS(t.id)}')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/20 transition font-semibold text-sm flex items-center gap-1.5 active:scale-95">
                            <i class="fa-solid fa-print"></i> พิมพ์ใบเบิกอะไหล่
                        </button>
                    `;
                } else {
                    actionButtonsWrap.innerHTML = `
                        <span class="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-2 rounded-xl border border-rose-200"><i class="fa-solid fa-ban mr-1"></i> ยกเลิกใบเบิกแล้ว</span>
                    `;
                }
            }
        }

        async function promptChangeApprovalItem(index) {
            if (index < 0 || index >= currentApprovalEditingItems.length) return;
            const currentItem = currentApprovalEditingItems[index];
            const tx = (transactions || []).find(x => x.id === currentApprovalSelectedTxId);
            const priceTier = tx ? (tx.price_tier || 'ราคากลาง') : 'ราคากลาง';

            const products = (db && Array.isArray(db.products)) ? db.products : [];
            if (products.length === 0) {
                showToast('ไม่พบข้อมูลรายการสินค้าในระบบ', 'error');
                return;
            }

            const sortedProducts = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            const productOptionsHtml = sortedProducts.map(p => {
                const isSel = (p.id == currentItem.product_id) ? 'selected' : '';
                const price = getProductPriceByTier(p, priceTier);
                return `<option value="${escapeHTML(p.id)}" ${isSel}>${escapeHTML(p.id)} - ${escapeHTML(p.name)} (คงเหลือ: ${(p.stock || 0).toLocaleString()} ${escapeHTML(p.unit || 'ชิ้น')} | ฿${price.toLocaleString('th-TH', {minimumFractionDigits: 2})})</option>`;
            }).join('');

            const initialProd = products.find(p => p.id == currentItem.product_id);
            const initialPrice = initialProd ? getProductPriceByTier(initialProd, priceTier) : (currentItem.price || 0);

            const { value: formValues } = await Swal.fire({
                title: '<div class="text-base font-bold text-slate-800"><i class="fa-solid fa-pen-to-square text-blue-600 mr-1.5"></i>แก้ไข / เปลี่ยนรายการอะไหล่</div>',
                html: `
                    <div class="text-left text-xs space-y-3 pt-2">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">เลือกอะไหล่ทดแทน / อะไหล่เดิม:</label>
                            <select id="swal_change_product" class="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                                ${productOptionsHtml}
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">จำนวนที่ต้องการเบิก:</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="swal_change_qty" min="1" step="1" value="${currentItem.qty}" class="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span id="swal_change_unit" class="text-slate-500 font-bold whitespace-nowrap">${escapeHTML(initialProd?.unit || 'ชิ้น')}</span>
                            </div>
                        </div>
                        <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex justify-between items-center text-xs">
                            <span class="text-slate-600 font-medium">ระดับราคา (${escapeHTML(priceTier)}):</span>
                            <span id="swal_change_price_preview" class="font-bold text-blue-700">฿${Number(initialPrice).toLocaleString('th-TH', {minimumFractionDigits: 2})} / ชิ้น</span>
                        </div>
                        <div class="flex justify-between items-center text-xs px-1">
                            <span class="text-slate-500 font-medium">รวมย่อยรายการนี้:</span>
                            <span id="swal_change_subtotal_preview" class="font-black text-slate-900 text-sm">฿${Number(initialPrice * currentItem.qty).toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>
                `,
                didOpen: () => {
                    const prodSel = document.getElementById('swal_change_product');
                    const qtyInput = document.getElementById('swal_change_qty');
                    const unitSpan = document.getElementById('swal_change_unit');
                    const pricePreview = document.getElementById('swal_change_price_preview');
                    const subtotalPreview = document.getElementById('swal_change_subtotal_preview');

                    const updatePreview = () => {
                        const pid = prodSel.value;
                        const prod = products.find(p => p.id == pid);
                        const q = Math.max(1, parseInt(qtyInput.value, 10) || 1);
                        if (prod) {
                            unitSpan.textContent = prod.unit || 'ชิ้น';
                            const pr = getProductPriceByTier(prod, priceTier);
                            pricePreview.textContent = `฿${pr.toLocaleString('th-TH', {minimumFractionDigits: 2})} / ${prod.unit || 'ชิ้น'}`;
                            subtotalPreview.textContent = `฿${(pr * q).toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
                        }
                    };

                    prodSel.addEventListener('change', updatePreview);
                    qtyInput.addEventListener('input', updatePreview);
                },
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-check"></i> บันทึกรายการนี้',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#94a3b8',
                customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold', cancelButton: 'rounded-xl' },
                preConfirm: () => {
                    const pid = document.getElementById('swal_change_product').value;
                    const qty = parseInt(document.getElementById('swal_change_qty').value, 10);
                    if (!pid) {
                        Swal.showValidationMessage('กรุณาเลือกรายการสินค้า');
                        return false;
                    }
                    if (isNaN(qty) || qty <= 0) {
                        Swal.showValidationMessage('จำนวนสินค้าต้องมากกว่า 0');
                        return false;
                    }
                    return { productId: pid, qty: qty };
                }
            });

            if (!formValues) return;

            const selectedProd = products.find(p => p.id == formValues.productId);
            if (!selectedProd) return;

            const newPrice = getProductPriceByTier(selectedProd, priceTier);
            currentApprovalEditingItems[index] = {
                product_id: selectedProd.id,
                qty: formValues.qty,
                price: newPrice
            };
            hasApprovalItemsChanged = true;

            const isAdmin = currentUser && currentUser.role === 'ADMIN';
            const isApproverUser = currentUser && (
                currentUser.canApprove === true ||
                (tx?.approver_email && currentUser.email && tx.approver_email.toLowerCase() === currentUser.email.toLowerCase()) ||
                (tx?.approver && currentUser.fullName && tx.approver.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase())
            );
            renderApprovalItemsTable((isAdmin || isApproverUser) && (tx?.approval_status === 'Pending' || (!tx?.approval_status && tx?.status === 'Success')));
            showToast('แก้ไขรายการอะไหล่เรียบร้อยแล้ว', 'success');
        }

        async function promptAddApprovalItem() {
            const tx = (transactions || []).find(x => x.id === currentApprovalSelectedTxId);
            const priceTier = tx ? (tx.price_tier || 'ราคากลาง') : 'ราคากลาง';

            const products = (db && Array.isArray(db.products)) ? db.products : [];
            if (products.length === 0) {
                showToast('ไม่พบข้อมูลรายการสินค้าในระบบ', 'error');
                return;
            }

            const sortedProducts = [...products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            const productOptionsHtml = sortedProducts.map((p, i) => {
                const price = getProductPriceByTier(p, priceTier);
                return `<option value="${escapeHTML(p.id)}" ${i === 0 ? 'selected' : ''}>${escapeHTML(p.id)} - ${escapeHTML(p.name)} (คงเหลือ: ${(p.stock || 0).toLocaleString()} ${escapeHTML(p.unit || 'ชิ้น')} | ฿${price.toLocaleString('th-TH', {minimumFractionDigits: 2})})</option>`;
            }).join('');

            const firstProd = sortedProducts[0];
            const initialPrice = firstProd ? getProductPriceByTier(firstProd, priceTier) : 0;

            const { value: formValues } = await Swal.fire({
                title: '<div class="text-base font-bold text-slate-800"><i class="fa-solid fa-plus-circle text-emerald-600 mr-1.5"></i>เพิ่มรายการอะไหล่ในใบเบิก</div>',
                html: `
                    <div class="text-left text-xs space-y-3 pt-2">
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">เลือกอะไหล่:</label>
                            <select id="swal_add_product" class="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                                ${productOptionsHtml}
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">จำนวนที่ต้องการเบิก:</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="swal_add_qty" min="1" step="1" value="1" class="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                                <span id="swal_add_unit" class="text-slate-500 font-bold whitespace-nowrap">${escapeHTML(firstProd?.unit || 'ชิ้น')}</span>
                            </div>
                        </div>
                        <div class="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
                            <span class="text-slate-600 font-medium">ระดับราคา (${escapeHTML(priceTier)}):</span>
                            <span id="swal_add_price_preview" class="font-bold text-emerald-700">฿${Number(initialPrice).toLocaleString('th-TH', {minimumFractionDigits: 2})} / ชิ้น</span>
                        </div>
                        <div class="flex justify-between items-center text-xs px-1">
                            <span class="text-slate-500 font-medium">รวมย่อยรายการนี้:</span>
                            <span id="swal_add_subtotal_preview" class="font-black text-slate-900 text-sm">฿${Number(initialPrice).toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>
                `,
                didOpen: () => {
                    const prodSel = document.getElementById('swal_add_product');
                    const qtyInput = document.getElementById('swal_add_qty');
                    const unitSpan = document.getElementById('swal_add_unit');
                    const pricePreview = document.getElementById('swal_add_price_preview');
                    const subtotalPreview = document.getElementById('swal_add_subtotal_preview');

                    const updatePreview = () => {
                        const pid = prodSel.value;
                        const prod = products.find(p => p.id == pid);
                        const q = Math.max(1, parseInt(qtyInput.value, 10) || 1);
                        if (prod) {
                            unitSpan.textContent = prod.unit || 'ชิ้น';
                            const pr = getProductPriceByTier(prod, priceTier);
                            pricePreview.textContent = `฿${pr.toLocaleString('th-TH', {minimumFractionDigits: 2})} / ${prod.unit || 'ชิ้น'}`;
                            subtotalPreview.textContent = `฿${(pr * q).toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
                        }
                    };

                    prodSel.addEventListener('change', updatePreview);
                    qtyInput.addEventListener('input', updatePreview);
                },
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-plus"></i> เพิ่มรายการ',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#059669',
                cancelButtonColor: '#94a3b8',
                customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold', cancelButton: 'rounded-xl' },
                preConfirm: () => {
                    const pid = document.getElementById('swal_add_product').value;
                    const qty = parseInt(document.getElementById('swal_add_qty').value, 10);
                    if (!pid) {
                        Swal.showValidationMessage('กรุณาเลือกรายการสินค้า');
                        return false;
                    }
                    if (isNaN(qty) || qty <= 0) {
                        Swal.showValidationMessage('จำนวนสินค้าต้องมากกว่า 0');
                        return false;
                    }
                    return { productId: pid, qty: qty };
                }
            });

            if (!formValues) return;

            const selectedProd = products.find(p => p.id == formValues.productId);
            if (!selectedProd) return;

            const newPrice = getProductPriceByTier(selectedProd, priceTier);
            const existingIdx = currentApprovalEditingItems.findIndex(it => it.product_id == selectedProd.id);
            if (existingIdx !== -1) {
                currentApprovalEditingItems[existingIdx].qty += formValues.qty;
            } else {
                currentApprovalEditingItems.push({
                    product_id: selectedProd.id,
                    qty: formValues.qty,
                    price: newPrice
                });
            }
            hasApprovalItemsChanged = true;

            const isAdmin = currentUser && currentUser.role === 'ADMIN';
            const isApproverUser = currentUser && (
                currentUser.canApprove === true ||
                (tx?.approver_email && currentUser.email && tx.approver_email.toLowerCase() === currentUser.email.toLowerCase()) ||
                (tx?.approver && currentUser.fullName && tx.approver.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase())
            );
            renderApprovalItemsTable((isAdmin || isApproverUser) && (tx?.approval_status === 'Pending' || (!tx?.approval_status && tx?.status === 'Success')));
            showToast('เพิ่มรายการอะไหล่เรียบร้อยแล้ว', 'success');
        }

        async function deleteApprovalItem(index) {
            if (index < 0 || index >= currentApprovalEditingItems.length) return;

            if (currentApprovalEditingItems.length <= 1) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ไม่สามารถลบรายการได้',
                    text: 'ใบเบิกต้องมีรายการอะไหล่อย่างน้อย 1 รายการ หากต้องการยกเลิกคำขอทั้งหมด กรุณากดปุ่ม "ไม่อนุมัติคำขอ"',
                    confirmButtonColor: '#e11d48',
                    customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl' }
                });
                return;
            }

            const item = currentApprovalEditingItems[index];
            const prod = (db && Array.isArray(db.products)) ? db.products.find(p => p.id == item.product_id) : null;
            const prodName = prod ? prod.name : item.product_id;

            const confirmResult = await Swal.fire({
                title: 'ยืนยันการลบรายการอะไหล่?',
                html: `ต้องการลบรายการ <strong class="text-rose-600">${escapeHTML(prodName)}</strong> (${item.qty} ชิ้น) ออกจากใบขอเบิกนี้ใช่หรือไม่?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#e11d48',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: '<i class="fa-solid fa-trash-can"></i> ลบรายการนี้',
                cancelButtonText: 'ยกเลิก',
                customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold', cancelButton: 'rounded-xl' }
            });

            if (!confirmResult.isConfirmed) return;

            currentApprovalEditingItems.splice(index, 1);
            hasApprovalItemsChanged = true;

            const tx = (transactions || []).find(x => x.id === currentApprovalSelectedTxId);
            const isAdmin = currentUser && currentUser.role === 'ADMIN';
            const isApproverUser = currentUser && (
                currentUser.canApprove === true ||
                (tx?.approver_email && currentUser.email && tx.approver_email.toLowerCase() === currentUser.email.toLowerCase()) ||
                (tx?.approver && currentUser.fullName && tx.approver.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase())
            );
            renderApprovalItemsTable((isAdmin || isApproverUser) && (tx?.approval_status === 'Pending' || (!tx?.approval_status && tx?.status === 'Success')));
            showToast('ลบรายการอะไหล่เรียบร้อยแล้ว', 'info');
        }

        function closeApprovalModal() {
            const modal = document.getElementById('approvalActionModal');
            if (modal) modal.classList.add('hidden');
            currentApprovalSelectedTxId = null;
            currentApprovalEditingItems = [];
            hasApprovalItemsChanged = false;
            const changedBadge = document.getElementById('aamItemsChangedBadge');
            if (changedBadge) changedBadge.classList.add('hidden');
        }

        async function handleSaveApprovalItemChanges() {
            if (!currentApprovalSelectedTxId) return;
            const txId = currentApprovalSelectedTxId;
            const note = document.getElementById('aam_approval_note')?.value.trim() || '';

            if (currentApprovalEditingItems.length === 0) {
                showToast('ต้องมีรายการอะไหล่อย่างน้อย 1 รายการ', 'warning');
                return;
            }

            const confirmResult = await Swal.fire({
                title: 'บันทึกการแก้ไขรายการอะไหล่?',
                html: `คุณต้องการบันทึกการเปลี่ยนแปลงรายการอะไหล่สำหรับใบเบิก <strong class="text-blue-600">${escapeHTML(txId)}</strong> ใช่หรือไม่?<br><span class="text-xs text-slate-500">(สถานะเอกสารจะยังคงเป็น "รออนุมัติ")</span>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: '<i class="fa-solid fa-save"></i> บันทึกข้อมูล',
                cancelButtonText: 'ยกเลิก',
                customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold', cancelButton: 'rounded-xl' }
            });

            if (!confirmResult.isConfirmed) return;

            showLoading('กำลังบันทึกการเปลี่ยนแปลงและอัปเดตสต็อก...');
            try {
                const payload = {
                    transaction_id: txId,
                    approval_status: 'Pending',
                    approval_note: note,
                    updated_items: currentApprovalEditingItems,
                    approved_by: currentUser.fullName,
                    approved_by_email: currentUser.email
                };

                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateApprovalStatus', payload: payload })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    const targetTx = (transactions || []).find(x => x.id === txId);
                    if (targetTx) {
                        targetTx.items = JSON.parse(JSON.stringify(currentApprovalEditingItems));
                        let newPartsTotal = 0;
                        targetTx.items.forEach(it => {
                            it.subtotal = it.qty * it.price;
                            newPartsTotal += it.subtotal;
                        });
                        targetTx.parts_total = newPartsTotal;
                        targetTx.total_price = newPartsTotal + (Number(targetTx.labor_cost) || 0);
                        if (note) targetTx.approval_note = note;
                    }

                    hasApprovalItemsChanged = false;
                    closeApprovalModal();
                    renderApprovalTable();
                    updateApprovalBadge();

                    Swal.fire({
                        icon: 'success',
                        title: 'บันทึกการแก้ไขสำเร็จ!',
                        text: `อัปเดตรายการอะไหล่ของใบเบิก ${txId} เรียบร้อยแล้ว`,
                        confirmButtonColor: '#2563eb',
                        customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl' }
                    });
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อบันทึกการแก้ไขได้', 'error');
            }
            hideLoading();
        }

        async function handleApproveApproval() {
            if (!currentApprovalSelectedTxId) return;
            const txId = currentApprovalSelectedTxId;
            const note = document.getElementById('aam_approval_note')?.value.trim() || '';

            if (currentApprovalEditingItems.length === 0) {
                showToast('ต้องมีรายการอะไหล่อย่างน้อย 1 รายการเพื่ออนุมัติ', 'warning');
                return;
            }

            const title = hasApprovalItemsChanged ? 'ยืนยันบันทึกและอนุมัติคำขอเบิก?' : 'ยืนยันการอนุมัติคำขอเบิก?';
            const html = hasApprovalItemsChanged
                ? `เลขที่ใบเบิก: <strong class="text-blue-600">${escapeHTML(txId)}</strong><br><span class="text-amber-700 font-bold"><i class="fa-solid fa-pen-to-square"></i> มีการแก้ไขรายการอะไหล่</span><br>คุณต้องการบันทึกการเปลี่ยนแปลงและอนุมัติเอกสารนี้ใช่หรือไม่?`
                : `เลขที่ใบเบิก: <strong class="text-blue-600">${escapeHTML(txId)}</strong><br>คุณต้องการอนุมัติเอกสารเบิกจ่ายนี้ใช่หรือไม่?`;

            const confirmResult = await Swal.fire({
                title: title,
                html: html,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#059669',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: '<i class="fa-solid fa-check-circle"></i> ยืนยันอนุมัติ',
                cancelButtonText: 'ยกเลิก',
                customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold', cancelButton: 'rounded-xl' }
            });

            if (!confirmResult.isConfirmed) return;

            showLoading('กำลังบันทึกผลการอนุมัติเอกสาร...');
            try {
                const payload = {
                    transaction_id: txId,
                    approval_status: 'Approved',
                    approval_note: note,
                    approved_by: currentUser.fullName,
                    approved_by_email: currentUser.email
                };

                if (hasApprovalItemsChanged) {
                    payload.updated_items = currentApprovalEditingItems;
                }

                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateApprovalStatus', payload: payload })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    // Update local transactions data
                    const targetTx = (transactions || []).find(x => x.id === txId);
                    if (targetTx) {
                        const now = new Date();
                        const yyyy = now.getFullYear();
                        const mm = String(now.getMonth() + 1).padStart(2, '0');
                        const dd = String(now.getDate()).padStart(2, '0');
                        const hh = String(now.getHours()).padStart(2, '0');
                        const min = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

                        targetTx.approval_status = 'Approved';
                        targetTx.approval_by = currentUser.fullName;
                        targetTx.approval_by_email = currentUser.email;
                        targetTx.approval_date = dateStr;
                        targetTx.approval_note = note;

                        if (hasApprovalItemsChanged) {
                            targetTx.items = JSON.parse(JSON.stringify(currentApprovalEditingItems));
                            let newPartsTotal = 0;
                            targetTx.items.forEach(it => {
                                it.subtotal = it.qty * it.price;
                                newPartsTotal += it.subtotal;
                            });
                            targetTx.parts_total = newPartsTotal;
                            targetTx.total_price = newPartsTotal + (Number(targetTx.labor_cost) || 0);
                        }
                    }

                    closeApprovalModal();
                    renderApprovalTable();
                    updateApprovalBadge();

                    Swal.fire({
                        icon: 'success',
                        title: 'อนุมัติเอกสารสำเร็จ!',
                        text: `ใบเบิกเลขที่ ${txId} ได้รับการอนุมัติเรียบร้อยแล้ว`,
                        confirmButtonColor: '#059669',
                        customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl' }
                    });
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อบันทึกการอนุมัติได้', 'error');
            }
            hideLoading();
        }

        async function handleRejectApproval() {
            if (!currentApprovalSelectedTxId) return;
            const txId = currentApprovalSelectedTxId;
            let note = document.getElementById('aam_approval_note')?.value.trim() || '';

            if (!note) {
                const { value: reasonInput } = await Swal.fire({
                    title: 'ระบุเหตุผลที่ไม่อนุมัติ',
                    input: 'textarea',
                    inputLabel: 'เหตุผลการไม่อนุมัติคำขอเบิก',
                    inputPlaceholder: 'พิมพ์เหตุผลที่ไม่อนุมัติเพื่อให้ผู้ประเมินซ่อมทราบ...',
                    inputAttributes: { 'aria-label': 'เหตุผลการไม่อนุมัติ' },
                    showCancelButton: true,
                    confirmButtonText: 'ถัดไป',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#e11d48',
                    customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl', cancelButton: 'rounded-xl' },
                    inputValidator: (value) => {
                        if (!value || !value.trim()) {
                            return 'กรุณาระบุเหตุผลการไม่อนุมัติ';
                        }
                    }
                });

                if (!reasonInput) return;
                note = reasonInput.trim();
            }

            const confirmResult = await Swal.fire({
                title: 'ยืนยันปฏิเสธ (ไม่อนุมัติ)?',
                html: `ใบเบิกเลขที่: <strong class="text-rose-600">${escapeHTML(txId)}</strong><br><span class="text-sm text-slate-500">ระบบจะทำการยกเลิกใบเบิกและคืนสต็อกอะไหล่กลับเข้าคลังโดยอัตโนมัติ</span>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#e11d48',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: '<i class="fa-solid fa-times-circle"></i> ยืนยันไม่อนุมัติ',
                cancelButtonText: 'ยกเลิก',
                customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl font-bold', cancelButton: 'rounded-xl' }
            });

            if (!confirmResult.isConfirmed) return;

            showLoading('กำลังบันทึกผลและคืนสต็อกอะไหล่...');
            try {
                const payload = {
                    transaction_id: txId,
                    approval_status: 'Rejected',
                    approval_note: note,
                    approved_by: currentUser.fullName,
                    approved_by_email: currentUser.email
                };

                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateApprovalStatus', payload: payload })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    // Update local transactions data
                    const targetTx = (transactions || []).find(x => x.id === txId);
                    if (targetTx) {
                        const now = new Date();
                        const yyyy = now.getFullYear();
                        const mm = String(now.getMonth() + 1).padStart(2, '0');
                        const dd = String(now.getDate()).padStart(2, '0');
                        const hh = String(now.getHours()).padStart(2, '0');
                        const min = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

                        targetTx.approval_status = 'Rejected';
                        targetTx.status = 'Cancelled';
                        targetTx.approval_by = currentUser.fullName;
                        targetTx.approval_by_email = currentUser.email;
                        targetTx.approval_date = dateStr;
                        targetTx.approval_note = note;
                    }

                    closeApprovalModal();
                    renderApprovalTable();
                    updateApprovalBadge();

                    // Re-fetch product stock in background
                    fetchData(false);

                    Swal.fire({
                        title: 'ปฏิเสธคำขอและคืนสต็อกแล้ว',
                        text: `ใบเบิกเลขที่ ${txId} ถูกปรับเป็นไม่อนุมัติ และคืนสต็อกเข้าคลังเรียบร้อยแล้ว`,
                        confirmButtonColor: '#3b82f6',
                        customClass: { popup: 'rounded-2xl', confirmButton: 'rounded-xl' }
                    });
                } else {
                    showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อบันทึกผลได้', 'error');
            }
            hideLoading();
        }

        function printPOSSlipById(txId) {
            const t = (transactions || []).find(x => x.id === txId);
            if (t) {
                printPOSSlip(t);
            } else {
                showToast("ไม่พบข้อมูลใบเบิก", "error");
            }
        }


        // ===== Transactions History Client Logic =====
        async function loadTransactions() {
            showLoading('กำลังโหลดประวัติใบเบิกอะไหล่...');
            try {
                let transRes = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getTransactions' }) });
                let result = await transRes.json();
                if (result.status === 'success') {
                    transactions = result.data || [];
                    renderTransactionsTable();
                    updateApprovalBadge();
                } else {
                    showToast('ดึงข้อมูลประวัติไม่สำเร็จ: ' + result.message, 'error');
                }
            } catch (err) {
                showToast('ไม่สามารถดึงข้อมูลประวัติจากเครือข่ายได้', 'error');
            }
            hideLoading();
        }

        function renderTransactionsTable() {
            const tbody = document.getElementById('transactionTableBody');
            const searchKeyword = document.getElementById('searchTransactionInput').value.toLowerCase();
            const keywords = searchKeyword.split(/\s+/).filter(k => k.length > 0);
            const statusFilter = document.getElementById('filterTransactionStatus').value;
            
            tbody.innerHTML = '';

            // กรองข้อมูลสำหรับบทบาททั่วไป ให้เห็นเฉพาะของตัวเอง
            let transactionsToRender = transactions;
            if (isLoggedIn && currentUser && currentUser.role !== 'ADMIN' && currentUser.role !== 'Manager') {
                transactionsToRender = transactions.filter(t => t.requester === currentUser.fullName);
            }
            
            let filtered = transactionsToRender.filter(t => {
                const approvalText = t.approval_status === 'Approved' ? 'อนุมัติแล้ว' : (t.approval_status === 'Rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ');
                const textToSearch = `${t.id} ${t.requester} ${t.department} ${t.machine_id || ''} ${t.serial_number || ''} ${t.approval_status || ''} ${approvalText}`.toLowerCase();
                const matchSearch = keywords.length === 0 || keywords.every(kw => textToSearch.includes(kw));
                const matchStatus = statusFilter === 'all' || t.status === statusFilter;
                return matchSearch && matchStatus;
            });
            
            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="p-10 text-center text-gray-400"><i class="fa-solid fa-receipt text-4xl mb-3 opacity-30 block"></i>ไม่พบข้อมูลใบเบิกที่ค้นหา</td></tr>`;
                return;
            }
            
            filtered.forEach((t, index) => {
                const isCancelled = t.status === 'Cancelled';
                let statusHtml = '';
                if (isCancelled) {
                    statusHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">ยกเลิกใบเบิก</span>`;
                } else if (t.status === 'Restock') {
                    statusHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">เติมสต็อก</span>`;
                } else {
                    statusHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">เบิกจ่ายสำเร็จ</span>`;
                }
                
                let approvalHtml = '';
                if (t.status === 'Restock') {
                    approvalHtml = `<span class="text-xs text-gray-400 font-medium">-</span>`;
                } else if (t.approval_status === 'Approved') {
                    approvalHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1"><i class="fa-solid fa-stamp text-[10px]"></i>อนุมัติแล้ว</span>`;
                } else if (t.approval_status === 'Rejected') {
                    approvalHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1"><i class="fa-solid fa-ban text-[10px]"></i>ไม่อนุมัติ</span>`;
                } else {
                    approvalHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1"><i class="fa-solid fa-clock text-[10px]"></i>รออนุมัติ</span>`;
                }

                const totalVal = t.status === 'Restock' ? '-' : `฿${t.total_price.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                
                let tr = `
                    <tr class="hover:bg-slate-50 transition border-b border-gray-150 last:border-0 ${isCancelled ? 'bg-red-50/10' : ''}">
                        <td class="p-4 text-center text-gray-500">${index + 1}</td>
                        <td class="p-4 font-bold text-gray-900">${escapeHTML(t.id)}</td>
                        <td class="p-4 text-gray-500 text-xs font-semibold">${escapeHTML(t.date)}</td>
                        <td class="p-4 text-gray-700 font-semibold">${escapeHTML(t.requester)}</td>
                        <td class="p-4 text-gray-600">${escapeHTML(t.department)}</td>
                        <td class="p-4 text-gray-500 font-medium">${escapeHTML(t.machine_id || '-')}</td>
                        <td class="p-4 text-gray-700 font-mono text-xs font-semibold">${escapeHTML(t.serial_number || '-')}</td>
                        <td class="p-4 text-right font-bold text-blue-600">${totalVal}</td>
                        <td class="p-4 text-center">${statusHtml}</td>
                        <td class="p-4 text-center">${approvalHtml}</td>
                        <td class="p-4 text-center">
                            <button onclick="openTransactionDetailModal('${escapeForJS(t.id)}')" class="text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5" title="ดูรายละเอียดใบเบิก"><i class="fa-solid fa-eye"></i> รายละเอียด</button>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            });
        }

        function openTransactionDetailModal(txId) {
            const t = transactions.find(x => x.id === txId);
            if (!t) return;
            
            const isRestock = t.status === 'Restock';
            document.getElementById('tdm_id_subtitle').innerText = (isRestock ? "เลขที่ใบเติมสต็อก: " : "เลขที่ใบเบิก: ") + t.id;
            document.getElementById('tdm_date').innerText = t.date;
            document.getElementById('tdm_requester').innerText = t.requester || '-';
            
            const approverEl = document.getElementById('tdm_approver');
            if (approverEl) approverEl.innerText = t.approver || '-';
            const deptEl = document.getElementById('tdm_department');
            if (deptEl) deptEl.innerText = t.department || '-';
            
            const custTypeEl = document.getElementById('tdm_customer_type');
            if (custTypeEl) custTypeEl.innerText = t.customer_type || '-';
            const priceTierEl = document.getElementById('tdm_price_tier');
            if (priceTierEl) priceTierEl.innerText = t.price_tier || '-';
            
            const machine = t.machine_id ? db.machines.find(m => m.id == t.machine_id) : null;
            const machineText = machine ? (t.machine_id + " : " + machine.name) : (t.machine_id || "ไม่ระบุเครื่องจักร");
            document.getElementById('tdm_machine').innerText = isRestock ? "-" : machineText;
            document.getElementById('tdm_serial_number').innerText = isRestock ? "-" : (t.serial_number || "ไม่ระบุ");
            
            const machineModelEl = document.getElementById('tdm_machine_model');
            if (machineModelEl) machineModelEl.innerText = isRestock ? "-" : (t.machine_model || '-');
            const repairLevelEl = document.getElementById('tdm_repair_level');
            if (repairLevelEl) repairLevelEl.innerText = isRestock ? "-" : (t.repair_level || '-');

            const tdmJobDetailsEl = document.getElementById('tdm_job_details');
            if (tdmJobDetailsEl) {
                if (!isRestock && t.job_details) {
                    const items = t.job_details.split(',').map(s => s.trim()).filter(Boolean);
                    tdmJobDetailsEl.innerHTML = items.map(it => `<span class="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i class="fa-solid fa-check text-[10px] text-amber-600"></i>${escapeHTML(it)}</span>`).join('');
                } else {
                    tdmJobDetailsEl.innerHTML = '<span class="text-xs text-gray-400 italic">' + (isRestock ? '-' : 'ไม่ได้ระบุรายละเอียดงาน') + '</span>';
                }
            }

            document.getElementById('tdm_note').innerText = t.note || "ไม่มีบันทึกข้อมูลเพิ่มเติม";
            
            const isCancelled = t.status === 'Cancelled';
            const statusEl = document.getElementById('tdm_status');
            if (isCancelled) {
                statusEl.className = "text-red-600 font-extrabold text-sm";
                statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> ยกเลิกใบเบิก (คืนสต็อกแล้ว)';
                document.getElementById('tdmCancelBtn').classList.add('hidden');
            } else if (isRestock) {
                statusEl.className = "text-blue-600 font-extrabold text-sm";
                statusEl.innerHTML = '<i class="fa-solid fa-boxes-stacked mr-1"></i> เติมสต็อกสำเร็จ';
                document.getElementById('tdmCancelBtn').classList.add('hidden');
            } else {
                statusEl.className = "text-green-600 font-extrabold text-sm flex items-center flex-wrap gap-1.5";
                statusEl.innerHTML = '<span class="inline-flex items-center"><i class="fa-solid fa-circle-check mr-1"></i> ทำรายการสำเร็จ</span>';
                
                if (t.approval_status === 'Approved') {
                    statusEl.innerHTML += `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><i class="fa-solid fa-stamp mr-1"></i>อนุมัติแล้ว</span>`;
                } else if (t.approval_status === 'Rejected') {
                    statusEl.innerHTML += `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300"><i class="fa-solid fa-ban mr-1"></i>ไม่อนุมัติ</span>`;
                } else {
                    statusEl.innerHTML += `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300"><i class="fa-solid fa-clock mr-1"></i>รออนุมัติ</span>`;
                }
                
                if (isLoggedIn) {
                    const canCancel = isLoggedIn && (currentUser.role === 'ADMIN' || currentUser.role === 'Manager');
                    if (canCancel) {
                        document.getElementById('tdmCancelBtn').classList.remove('hidden');
                        document.getElementById('tdmCancelBtn').onclick = () => requestCancelTransaction(t.id);
                    } else {
                        document.getElementById('tdmCancelBtn').classList.add('hidden');
                    }
                } else {
                    document.getElementById('tdmCancelBtn').classList.add('hidden');
                }
            }
            
            // Toggle Delete Button for ADMIN
            const deleteBtn = document.getElementById('tdmDeleteBtn');
            if (deleteBtn) {
                if (isLoggedIn && currentUser.role === 'ADMIN') {
                    deleteBtn.classList.remove('hidden');
                    deleteBtn.onclick = () => requestDeleteTransaction(t.id);
                } else {
                    deleteBtn.classList.add('hidden');
                }
            }
            
            // Render items list inside slip detail
            const itemsTbody = document.getElementById('tdmItemsTableBody');
            itemsTbody.innerHTML = '';
            
            let calculatedPartsTotal = 0;
            t.items.forEach(item => {
                const prodName = db.products.find(p => p.id == item.product_id)?.name || 'ไม่พบชื่อสินค้า';
                const subtotal = item.qty * item.price;
                calculatedPartsTotal += subtotal;
                const priceStr = isRestock ? '-' : `฿${item.price.toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
                const subtotalStr = isRestock ? '-' : `฿${subtotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}`;
                let tr = `
                    <tr class="hover:bg-slate-50 border-b border-gray-100 last:border-0">
                        <td class="p-3 font-mono font-bold text-gray-800">${escapeHTML(item.product_id)}</td>
                        <td class="p-3 text-gray-600 text-xs">${escapeHTML(prodName)}</td>
                        <td class="p-3 text-right font-bold text-gray-800">${item.qty}</td>
                        <td class="p-3 text-right text-gray-500">${priceStr}</td>
                        <td class="p-3 text-right font-bold text-blue-600">${subtotalStr}</td>
                    </tr>
                `;
                itemsTbody.insertAdjacentHTML('beforeend', tr);
            });
            
            const partsTotal = (t.parts_total !== undefined && t.parts_total !== null) ? Number(t.parts_total) : calculatedPartsTotal;
            const laborCost = Number(t.labor_cost) || 0;
            const grandTotal = Number(t.total_price) || (partsTotal + laborCost);

            const partsTotalEl = document.getElementById('tdm_parts_total');
            if (partsTotalEl) partsTotalEl.innerText = isRestock ? '-' : '฿' + partsTotal.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            const laborCostEl = document.getElementById('tdm_labor_cost');
            if (laborCostEl) laborCostEl.innerText = isRestock ? '-' : '฿' + laborCost.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            document.getElementById('tdm_total_price').innerText = isRestock ? '-' : '฿' + grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            
            // พิมพ์ใบเสร็จเบิก
            document.getElementById('tdmPrintBtn').onclick = () => printPOSSlip(t);
            
            document.getElementById('transactionDetailModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeTransactionDetailModal() {
            document.getElementById('transactionDetailModal').classList.add('hidden');
            document.body.style.overflow = '';
        }

        function requestCancelTransaction(txId) {
            confirmAction(`ยืนยันการยกเลิกใบเบิกเลขที่ "${txId}"?\nการยกเลิกใบเบิกจะทำการบวกจำนวนอะไหล่คืนเข้าคลังคงเดิมโดยอัตโนมัติ`, async () => {
                showLoading('กำลังยกเลิกรายการเบิกจ่าย...');
                try {
                    let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'cancelTransaction', payload: { transaction_id: txId } }) });
                    let result = await res.json();
                    
                    if (result.status === 'success') {
                        closeTransactionDetailModal();
                        showToast('ยกเลิกรายการและคืนยอดคลังสำเร็จ');
                        await fetchData(false);
                        await loadTransactions();
                    } else {
                        showToast('เกิดข้อผิดพลาด: ' + result.message, 'error');
                    }
                } catch (err) {
                    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย', 'error');
                }
                hideLoading();
            });
        }

        function requestDeleteTransaction(txId) {
            confirmAction(`⚠️ ยืนยันการลบใบเบิกเลขที่ "${txId}" ใช่หรือไม่?\nการลบนี้จะนำประวัติออกจากระบบอย่างถาวรและจะไม่มีการคืนสต็อกสินค้าคืนกลับเข้าคลัง!`, async () => {
                showLoading('กำลังลบประวัติใบเบิก...');
                try {
                    let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteTransaction', payload: { transaction_id: txId } }) });
                    let result = await res.json();
                    
                    if (result.status === 'success') {
                        closeTransactionDetailModal();
                        showToast('ลบรายการประวัติใบเบิกเรียบร้อยแล้ว', 'success');
                        await fetchData(false);
                        await loadTransactions();
                    } else {
                        showToast('ลบรายการไม่สำเร็จ: ' + result.message, 'error');
                    }
                } catch (err) {
                    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย', 'error');
                }
                hideLoading();
            });
        }

        function printPOSSlip(t) {
            const printWindow = window.open('', '_blank', 'width=900,height=700');
            if (!printWindow) { showToast('กรุณาอนุญาต popup ในเบราว์เซอร์ก่อน', 'error'); return; }
            const doc = printWindow.document;

            const machine = t.machine_id ? db.machines.find(m => m.id == t.machine_id) : null;
            const isRestock = t.status === 'Restock';
            const machineText = isRestock ? '-' : (machine ? (t.machine_id + " : " + machine.name) : (t.machine_id || "-"));
            const docTitle = isRestock ? 'ใบนำส่ง/เติมสต็อกอะไหล่' : 'ใบเบิกและประเมินงานซ่อมอะไหล่';
            const operatorLabel = isRestock ? 'ผู้เติมสต็อก:' : 'ผู้ประเมินซ่อม:';
            const logoUrl = 'https://lh3.googleusercontent.com/d/1kH8HErbms_U0xnoiJ7jlW7r79FK3hXeB';
            const companyNameTh = 'บริษัท พีรพัฒน์ เทคโนโลยี จำกัด (มหาชน) สำนักงานใหญ่';
            const companyNameEn = 'PEERAPAT TECHNOLOGY PUBLIC COMPANY LIMITED';
            const companyAddressTh = '406 ถ.รัชดาภิเษก แขวงสามเสนนอก เขตห้วยขวาง กรุงเทพ 10310';
            const companyAddressEn = '406 Ratchadapisek Rd., Samsen Nork, Huaykwang, Bangkok 10310';
            const companyContact = 'Tel. 02-290-1200 Fax: 02-290-1249';
            const companyWebsite = 'Web site: https://www.peerapat.com';
            const companyTaxId = 'เลขประจำตัวผู้เสียภาษี 0107551000231';

            let totalQty = 0;
            let itemsRows = '';
            let rowNum = 1;
            let calcPartsTotal = 0;
            t.items.forEach(function(item) {
                const prod = db.products.find(p => p.id == item.product_id);
                const prodName = prod ? prod.name : 'ไม่ระบุชื่อสินค้า';
                const unit = (prod && prod.unit) ? prod.unit : 'UNIT';
                const itemPrice = Number(item.price) || 0;
                const itemSubtotal = item.qty * itemPrice;
                calcPartsTotal += itemSubtotal;
                totalQty += item.qty;
                itemsRows += '<tr>'
                    + '<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;">' + rowNum++ + '. ' + prodName + '<br><span style="font-size:10px;color:#888;">' + item.product_id + '</span></td>'
                    + '<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:13px;font-weight:bold;">' + item.qty + '</td>'
                    + '<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12px;">' + unit + '</td>'
                    + (isRestock ? '' : ('<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12px;">฿' + itemPrice.toLocaleString('th-TH', {minimumFractionDigits: 2}) + '</td><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-size:12px;font-weight:bold;">฿' + itemSubtotal.toLocaleString('th-TH', {minimumFractionDigits: 2}) + '</td>'))
                    + '</tr>';
            });

            const partsTotal = (t.parts_total !== undefined && t.parts_total !== null) ? Number(t.parts_total) : calcPartsTotal;
            const laborCost = Number(t.labor_cost) || 0;
            const grandTotal = Number(t.total_price) || (partsTotal + laborCost);

            const css = '* { margin:0; padding:0; box-sizing:border-box; }'
                + '@page { size:A4 portrait; margin: 5mm; }'
                + 'body { font-family:Sarabun,sans-serif; font-size:13px; color:#222; background:#fff; }'
                + '.page-wrapper { width:100%; display:flex; flex-direction:column; min-height:calc(297mm - 10mm); }'
                + '.content-grow { flex-grow:1; }'
                + '.doc-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; }'
                + '.logo-block { flex:0 0 130px; text-align:left; }'
                + '.logo-block img { max-width:120px; max-height:60px; object-fit:contain; }'
                + '.company-block { flex:1; text-align:center; padding:0 20px; }'
                + '.company-name-th { font-size:14px; font-weight:700; }'
                + '.company-name-en { font-size:11px; font-weight:600; color:#444; margin-top:2px; }'
                + '.company-address { font-size:10px; color:#555; line-height:1.5; margin-top:4px; }'
                + '.company-contact { font-size:10px; color:#555; margin-top:4px; }'
                + '.doc-title-bar { text-align:center; font-size:14px; font-weight:700; border-top:1.5px solid #222; border-bottom:1.5px solid #222; padding:5px 0; margin:8px 0 12px 0; }'
                + '.meta-grid { display:flex; justify-content:space-between; margin-bottom:10px; font-size:12px; }'
                + '.meta-right { text-align:right; }'
                + '.meta-row { margin-bottom:3px; }'
                + '.meta-label { font-weight:600; }'
                + '.purpose-bar { background:#f5f5f5; border:1px solid #ddd; border-radius:4px; padding:6px 10px; font-size:12px; margin-bottom:14px; }'
                + '.items-table { width:100%; border-collapse:collapse; margin-bottom:14px; }'
                + '.items-table thead tr { background:#222; color:#fff; }'
                + '.items-table thead th { padding:8px 10px; font-size:12px; font-weight:600; text-align:left; }'
                + '.items-table tbody tr:nth-child(even) { background:#fafafa; }'
                + '.items-table tbody td { padding:6px 8px; font-size:12px; border-bottom:1px solid #eee; }'
                + '.summary-box { margin-left:auto; width:280px; margin-bottom:14px; font-size:12px; }'
                + '.summary-row { display:flex; justify-content:space-between; padding:3px 0; }'
                + '.summary-grand { font-size:14px; font-weight:700; border-top:1.5px solid #222; padding-top:4px; margin-top:3px; color:#15803d; }'
                + '.watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); opacity:0.05; pointer-events:none; width:420px; }'
                + '.sig-zone { display:flex; justify-content:space-between; margin-top:20px; padding:0 10px; }'
                + '.sig-col { text-align:center; width:180px; }'
                + '.sig-line { border-top:1px solid #333; padding-top:6px; font-size:11px; color:#444; margin-top:45px; }'
                + '.sig-name { font-size:11px; color:#666; margin-top:2px; }'
                + '.doc-footer { margin-top:30px; padding-top:10px; border-top:1px dashed #ccc; font-size:9px; color:#aaa; text-align:center; }'
                + '.print-toolbar { display:flex; justify-content:flex-end; padding:10px 0; }'
                + '.print-toolbar button { padding:8px 20px; background:#1d4ed8; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; }'
                + '@media print { .print-toolbar { display:none; } .watermark { position:fixed; } }';

            const html = '<!DOCTYPE html>'
                + '<html lang="th"><head><meta charset="UTF-8">'
                + '<title>ใบเบิกอะไหล่ - ' + t.id + '<\/title>'
                + '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">'
                + '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>'
                + '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>'
                + '<style>' + css + '<\/style>'
                + '<\/head><body onload="window.print()">'
                + '<img class="watermark" src="' + logoUrl + '" alt="">'
                + '<div class="print-toolbar">'
                + '<button onclick="exportPDF()" style="margin-right:10px;background:#16a34a;">&#128196; บันทึกเป็น PDF<\/button>'
                + '<button onclick="window.print()">&#128424; พิมพ์ใบเบิกอะไหล่<\/button>'
                + '<\/div>'
                + '<script>'
                + 'async function exportPDF(){'
                + ' try{'
                + '  var btns=document.querySelectorAll(".print-toolbar button");'
                + '  btns.forEach(function(b){b.disabled=true;b.style.opacity="0.5";});'
                + '  var el=document.getElementById("print-body");'
                + '  var canvas=await html2canvas(el,{scale:2,useCORS:true,allowTaint:true,logging:false});'
                + '  var imgData=canvas.toDataURL("image/jpeg",0.92);'
                + '  var j=window.jspdf.jsPDF;'
                + '  var pdf=new j({orientation:"portrait",unit:"mm",format:"a4"});'
                + '  var pw=pdf.internal.pageSize.getWidth();'
                + '  var ph=pdf.internal.pageSize.getHeight();'
                + '  var imgH=pw*(canvas.height/canvas.width);'
                + '  if(imgH<=ph){pdf.addImage(imgData,"JPEG",0,0,pw,imgH);}'
                + '  else{'
                + '   var pp=Math.floor(canvas.width*(ph/pw));'
                + '   var y=0;'
                + '   while(y<canvas.height){'
                + '    var sc=document.createElement("canvas");'
                + '    var sh=Math.min(pp,canvas.height-y);'
                + '    sc.width=canvas.width;sc.height=sh;'
                + '    sc.getContext("2d").drawImage(canvas,0,y,canvas.width,sh,0,0,canvas.width,sh);'
                + '    if(y>0)pdf.addPage();'
                + '    pdf.addImage(sc.toDataURL("image/jpeg",0.92),"JPEG",0,0,pw,pw*(sh/canvas.width));'
                + '    y+=sh;'
                + '   }'
                + '  }'
                + '  pdf.save("ใบเบิกอะไหล่-' + t.id + '.pdf");'
                + ' }catch(e){alert("เกิดข้อผิดพลาด: "+e.message);}'
                + ' var b2=document.querySelectorAll(".print-toolbar button");'
                + ' b2.forEach(function(b){b.disabled=false;b.style.opacity="1";});'
                + '}'
                + '<\/script>'
                + '<div id="print-body"><div class="page-wrapper">'
                    + '<div class="content-grow">'
                        + '<div class="doc-header">'
                            + '<div class="logo-block"><img src="' + logoUrl + '" alt="Logo" onerror="this.style.display=\'none\'"><\/div>'
                            + '<div class="company-block">'
                                 + '<div class="company-name-th">' + companyNameTh + '<\/div>'
                                 + '<div class="company-name-en">' + companyNameEn + '<\/div>'
                                 + '<div class="company-address">'
                                     + '<div>' + companyAddressTh + '<\/div>'
                                     + '<div>' + companyContact + ' &nbsp;|&nbsp; ' + companyWebsite + ' &nbsp;|&nbsp; ' + companyTaxId + '<\/div>'
                                 + '<\/div>'
                            + '<\/div>'
                            + '<div style="flex:0 0 130px;"><\/div>'
                        + '<\/div>'
                        + '<div class="doc-title-bar">' + docTitle + '<\/div>'
                        + '<div class="meta-grid">'
                            + '<div class="meta-left">'
                                + '<div class="meta-row"><span class="meta-label">' + (isRestock ? "เลขที่ใบเติมสต็อก:" : "เลขที่ใบเบิก:") + '<\/span> ' + t.id + '<\/div>'
                                + '<div class="meta-row"><span class="meta-label">วันที่:<\/span> ' + t.date + '<\/div>'
                                + '<div class="meta-row"><span class="meta-label">เครื่องจักร:<\/span> ' + machineText + '<\/div>'
                                + (isRestock ? '' : ('<div class="meta-row"><span class="meta-label">Machine Model:<\/span> ' + (t.machine_model || '-') + ' &nbsp;|&nbsp; <span class="meta-label">ระดับงานซ่อม:<\/span> ' + (t.repair_level || '-') + '<\/div>'))
                            + '<\/div>'
                            + '<div class="meta-right">'
                                + '<div class="meta-row"><span class="meta-label">' + operatorLabel + '<\/span> ' + (t.requester || '-') + '<\/div>'
                                + (isRestock ? ('<div class="meta-row"><span class="meta-label">แผนก:<\/span> ' + (t.department || '-') + '<\/div>') : ('<div class="meta-row"><span class="meta-label">ผู้อนุมัติ:<\/span> ' + (t.approver || '-') + '<\/div><div class="meta-row"><span class="meta-label">ประเภทลูกค้า:<\/span> ' + (t.customer_type || '-') + ' (' + (t.price_tier || '-') + ')<\/div>'))
                                + '<div class="meta-row"><span class="meta-label">Serial Number:<\/span> ' + (isRestock ? '-' : (t.serial_number || '-')) + '<\/div>'
                            + '<\/div>'
                        + '<\/div>'
                        + '<div class="purpose-bar"><span class="meta-label">' + (isRestock ? "หมายเหตุการเติมสต็อก:" : "วัตถุประสงค์การเบิก:") + '<\/span> ' + (t.note || '-') + '<\/div>'
                        + (!isRestock && t.job_details ? ('<div class="purpose-bar" style="margin-top:-6px;"><span class="meta-label">รายละเอียดงาน:<\/span> ' + escapeHTML(t.job_details) + '<\/div>') : '')
                        + '<table class="items-table">'
                            + '<thead><tr>'
                                + '<th>รายการ<\/th>'
                                + '<th style="width:70px;text-align:right;">จำนวน<\/th>'
                                + '<th style="width:60px;text-align:right;">หน่วย<\/th>'
                                + (isRestock ? '' : '<th style="width:90px;text-align:right;">ราคาต่อหน่วย<\/th><th style="width:100px;text-align:right;">ยอดรวม<\/th>')
                            + '<\/tr><\/thead>'
                            + '<tbody>' + itemsRows + '<\/tbody>'
                        + '<\/table>'
                        + (isRestock ? '' : ('<div class="summary-box">'
                            + '<div class="summary-row"><span>รวมค่าอะไหล่:<\/span><b>฿' + partsTotal.toLocaleString('th-TH', {minimumFractionDigits: 2}) + '<\/b><\/div>'
                            + '<div class="summary-row"><span>ค่าแรงงานซ่อม:<\/span><b>฿' + laborCost.toLocaleString('th-TH', {minimumFractionDigits: 2}) + '<\/b><\/div>'
                            + '<div class="summary-row summary-grand"><span>ยอดรวมสุทธิทั้งสิ้น:<\/span><span>฿' + grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2}) + '<\/span><\/div>'
                            + '<\/div>'))
                    + '<\/div>'
                    + '<div class="sig-zone">'
                        + '<div class="sig-col"><div class="sig-line">ลงชื่อ ...............................<\/div><div class="sig-name">(' + (t.requester || 'ผู้ประเมินซ่อม') + ')<\/div><div class="sig-name">' + (isRestock ? 'ผู้เติมสต็อก' : 'ผู้ประเมินซ่อม') + '<\/div><\/div>'
                        + (isRestock ? '' : ('<div class="sig-col"><div class="sig-line">ลงชื่อ ...............................<\/div><div class="sig-name">(' + (t.approver || 'ผู้อนุมัติ') + ')<\/div><div class="sig-name">ผู้อนุมัติ<\/div><\/div>'))
                        + '<div class="sig-col"><div class="sig-line">ลงชื่อ ...............................<\/div><div class="sig-name">(...............................)<\/div><div class="sig-name">ผู้จ่ายของสโตร์<\/div><\/div>'
                    + '<\/div>'
                + '<\/div>'
                + '<\/div>'
                + '<\/body><\/html>';

            doc.open();
            doc.write(html);
            doc.close();
        }
