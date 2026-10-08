/**
 * ====================================================================
 * Spare Parts QCM - Common Module (js/common.js)
 * ====================================================================
 * Core configuration, authentication, multi-language dictionary,
 * notifications, navigation, system settings, and data synchronization.
 */

const API_URL = 'https://script.google.com/macros/s/AKfycby4-NV1kd0YHLMvvFRG_ByGfYMg80KCM8n9fS4pn6JMrGa7hKG2oOR3H1brsQDtrcs1/exec';
        
        let db = { products: [], machines: [], mappings: [] };
        let isShowCostInCatalog = false;
        let isShowPriceBForGuest = false;
        let isShowPriceCForGuest = false;
        let selectedMappingProducts = new Set();
        let currentSelectedMachineForMapping = '';
        let isMobileCartOpen = false;

        let catalogCategories = [];
        let catalogMachines = [];
        let currentCatalogMode = 'products'; // 'products' หรือ 'machines'

        let currentCatalogPage = 1;
        let currentMapProductPage = 1;
        const MAP_PRODUCT_LIMIT = 50;

let transactions = [];
        // ===== Auth System =====
        let isLoggedIn = false;
        let currentUser = null; // { fullName, department, phone, email, role }
        
        const ROLE_PERMISSIONS = {
            'user': ['view-catalog', 'view-pos', 'view-transactions', 'view-settings', 'view-manual'],
            'Technician': ['view-catalog', 'view-pos', 'view-transactions', 'view-settings', 'view-manual'],
            'Manager': ['view-catalog', 'view-pos', 'view-transactions', 'view-add-product', 'view-edit-products', 'view-restock', 'view-report', 'view-restock-history', 'view-settings', 'view-manage-manuals', 'view-manual', 'view-user-management'],
            'ADMIN': ['view-catalog', 'view-pos', 'view-approval', 'view-transactions', 'view-add-product', 'view-machines', 'view-mapping', 'view-edit-products', 'view-edit-mapping', 'view-restock', 'view-report', 'view-restock-history', 'view-settings', 'view-manage-manuals', 'view-manual', 'view-user-management']
        };

        function hasAccess(viewId) {
            if (viewId === 'view-catalog' || viewId === 'view-manual') return true;
            if (!isLoggedIn || !currentUser) return false;
            if (viewId === 'view-approval') {
                return Boolean(currentUser.canApprove || currentUser.role === 'ADMIN');
            }
            const allowedViews = ROLE_PERMISSIONS[currentUser.role] || [];
            return allowedViews.includes(viewId);
        }

        document.addEventListener('DOMContentLoaded', () => { 
            const savedUser = sessionStorage.getItem('currentUser');
            if (savedUser) {
                try {
                    currentUser = JSON.parse(savedUser);
                    isLoggedIn = true;
                } catch (e) {
                    currentUser = null;
                    isLoggedIn = false;
                }
            }
            fetchData(true); 
            updateAuthUI(); 
        });

        document.addEventListener('click', function(event) {
            const inputCat = document.getElementById('input_filterCategory');
            if (inputCat) {
                const catContainer = inputCat.parentElement.parentElement;
                if (!catContainer.contains(event.target)) {
                    document.getElementById('dropdown_filterCategory').classList.add('hidden');
                    const hiddenCat = document.getElementById('filterCategory');
                    if(hiddenCat.value === 'all') inputCat.value = '';
                    else if(catalogCategories.includes(hiddenCat.value)) inputCat.value = hiddenCat.value;
                }
            }
            
            const inputMach = document.getElementById('input_filterMachine');
            if (inputMach) {
                const machContainer = inputMach.parentElement.parentElement;
                if (!machContainer.contains(event.target)) {
                    document.getElementById('dropdown_filterMachine').classList.add('hidden');
                    const hiddenMach = document.getElementById('filterMachine');
                    if(hiddenMach.value === 'all') inputMach.value = '';
                    else {
                        const m = catalogMachines.find(x => x.id === hiddenMach.value);
                        if(m) inputMach.value = m.id + ' : ' + m.name;
                    }
                }
            }
            
            const inputPosCat = document.getElementById('input_posCategoryFilter');
            if (inputPosCat) {
                const posCatContainer = inputPosCat.parentElement.parentElement;
                if (!posCatContainer.contains(event.target)) {
                    document.getElementById('dropdown_posCategoryFilter').classList.add('hidden');
                    const hiddenPosCat = document.getElementById('posCategoryFilter');
                    if (hiddenPosCat.value === 'all') inputPosCat.value = '';
                    else inputPosCat.value = hiddenPosCat.value;
                }
            }
            
            const inputPosMach = document.getElementById('input_posMachineFilter');
            if (inputPosMach) {
                const posMachContainer = inputPosMach.parentElement.parentElement;
                if (!posMachContainer.contains(event.target)) {
                    document.getElementById('dropdown_posMachineFilter').classList.add('hidden');
                    const hiddenPosMach = document.getElementById('posMachineFilter');
                    if (hiddenPosMach.value === 'all') inputPosMach.value = '';
                    else {
                        const m = db.machines.find(x => String(x.id) === hiddenPosMach.value);
                        if (m) inputPosMach.value = m.name;
                    }
                }
            }
            
            const mapMachContainer = document.getElementById('map_machine_search');
            if (mapMachContainer && !mapMachContainer.parentElement.contains(event.target)) hideMachineSuggestions();
            
            const restockProductInput = document.getElementById('restock_product_input');
            if (restockProductInput) {
                const restockContainer = restockProductInput.parentElement.parentElement;
                if (!restockContainer.contains(event.target)) {
                    document.getElementById('dropdown_restock_product').classList.add('hidden');
                }
            }

            const reportCatContainer = document.getElementById('report_filter_cat_input');
            if (reportCatContainer && !reportCatContainer.parentElement.contains(event.target)) {
                document.getElementById('report_filter_cat_dropdown').classList.add('hidden');
            }
            const reportMachContainer = document.getElementById('report_filter_mach_input');
            if (reportMachContainer && !reportMachContainer.parentElement.contains(event.target)) {
                document.getElementById('report_filter_mach_dropdown').classList.add('hidden');
            }
            const reportReqContainer = document.getElementById('report_filter_req_input');
            if (reportReqContainer && !reportReqContainer.parentElement.contains(event.target)) {
                document.getElementById('report_filter_req_dropdown').classList.add('hidden');
            }
            const reportDocContainer = document.getElementById('report_filter_doc_input');
            if (reportDocContainer && !reportDocContainer.parentElement.contains(event.target)) {
                document.getElementById('report_filter_doc_dropdown').classList.add('hidden');
            }
        });

        function escapeHTML(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function escapeForJS(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function fNumber(val, fallbackCalc) {
            let num = parseFloat(val);
            // แก้บัค 3: เช็คเฉพาะ NaN หรือ null/undefined ไม่รวม 0 เพื่อให้ราคา 0 บาทแสดงได้ถูกต้อง
            if (isNaN(num) || val === '' || val === null || val === undefined) {
                num = parseFloat(fallbackCalc);
            }
            if (isNaN(num)) num = 0; 
            return num.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }

        // fNumberM: เหมือน fNumber แต่ treat ราคา 0 เป็น "ยังไม่ได้กำหนด" → fallback คำนวณจาก cost
        // ใช้กับหมวดหมู่เครื่องจักร เพื่อให้พฤติกรรมเหมือนหมวดหมู่อะไหล่
        function fNumberM(val, fallbackCalc) {
            let num = parseFloat(val);
            if (isNaN(num) || val === '' || val === null || val === undefined || num === 0) {
                num = parseFloat(fallbackCalc);
            }
            if (isNaN(num)) num = 0;
            return num.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }

        function autoCalcMachinePrices(prefix) {
            const cost = parseFloat(document.getElementById(`${prefix}_cost`).value) || 0;
            if (cost > 0) {
                document.getElementById(`${prefix}_price_a`).value = (cost * 2.1).toFixed(2);
                document.getElementById(`${prefix}_price_b`).value = (cost * 1.7).toFixed(2);
                document.getElementById(`${prefix}_price_c`).value = (cost * 1.3).toFixed(2);
            } else {
                document.getElementById(`${prefix}_price_a`).value = '';
                document.getElementById(`${prefix}_price_b`).value = '';
                document.getElementById(`${prefix}_price_c`).value = '';
            }
        }

        function autoCalcSparePartPrices(prefix) {
            const cost = parseFloat(document.getElementById(`${prefix}_cost`).value) || 0;
            if (cost > 0) {
                document.getElementById(`${prefix}_price_a`).value = (cost * 2.1).toFixed(2);
                document.getElementById(`${prefix}_price_b`).value = (cost * 1.7).toFixed(2);
                document.getElementById(`${prefix}_price_c`).value = (cost * 1.3).toFixed(2);
            } else {
                document.getElementById(`${prefix}_price_a`).value = '';
                document.getElementById(`${prefix}_price_b`).value = '';
                document.getElementById(`${prefix}_price_c`).value = '';
            }
        }

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebarBackdrop');
            if (sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.remove('-translate-x-full');
                backdrop.classList.remove('hidden');
                document.body.style.overflow = 'hidden'; 
            } else {
                sidebar.classList.add('-translate-x-full');
                backdrop.classList.add('hidden');
                document.body.style.overflow = '';
            }
        }

        function switchView(viewId, element = null) {
            if (viewId === 'view-catalog' || viewId === 'view-manual') {
                // Public catalog and manuals always allowed
            } else if (!isLoggedIn) {
                showLoginDialog(() => switchView(viewId, element));
                return;
            } else if (!hasAccess(viewId)) {
                showToast("คุณไม่มีสิทธิ์เข้าถึงส่วนงานนี้", "error");
                return;
            }
            document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
            document.getElementById(viewId).classList.remove('hidden');

            if (viewId === 'view-restock') {
                initRestockView();
            }
            if (viewId === 'view-approval') {
                initApprovalView();
            }
            if (viewId === 'view-manual') {
                initManualView();
            }
            if (viewId === 'view-manage-manuals') {
                initManageManualsView();
            }
            if (viewId === 'view-user-management') {
                fetchAndRenderUsersList();
            }

            if (element) {
                document.querySelectorAll('.menu-item').forEach(el => {
                    el.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-900/20');
                    el.classList.add('text-gray-300');
                });
                element.classList.remove('text-gray-300');
                element.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-900/20');
            } else {
                const subSettingsViews = ['view-mapping', 'view-edit-products', 'view-edit-mapping', 'view-manage-manuals', 'view-user-management'];
                if (subSettingsViews.includes(viewId)) {
                    const settingsLink = document.querySelector('[data-view="view-settings"] a');
                    if (settingsLink) {
                        document.querySelectorAll('.menu-item').forEach(el => {
                            el.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-900/20');
                            el.classList.add('text-gray-300');
                        });
                        settingsLink.classList.remove('text-gray-300');
                        settingsLink.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-900/20');
                    }
                }
            }
            if (window.innerWidth < 768) {
                const sidebar = document.getElementById('sidebar');
                if (!sidebar.classList.contains('-translate-x-full')) toggleSidebar();
            }
        }

        function showRegisterDialog() {
            Swal.fire({
                title: '<i class="fa-solid fa-user-plus text-blue-500 mr-2"></i>สมัครสมาชิกใหม่',
                html: `
                    <div class="space-y-3 text-left mt-1 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">ชื่อ-สกุล <span class="text-red-500">*</span></label>
                            <input type="text" id="reg-fullname" class="swal2-input !mx-0 !w-full !text-xs !h-9" placeholder="เช่น นายสมชาย ใจดี">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">แผนก/ฝ่ายงาน <span class="text-red-500">*</span></label>
                            <input type="text" id="reg-department" class="swal2-input !mx-0 !w-full !text-xs !h-9" placeholder="เช่น ซ่อมบำรุง (Maintenance)">
                        </div>
                        <div class="grid grid-cols-2 gap-2.5">
                            <div>
                                <label class="block font-semibold text-gray-600 mb-1">เบอร์โทรศัพท์ <span class="text-red-500">*</span></label>
                                <input type="text" id="reg-phone" class="swal2-input !mx-0 !w-full !text-xs !h-9" placeholder="เช่น 0891234567">
                            </div>
                            <div>
                                <label class="block font-semibold text-gray-600 mb-1">อีเมล <span class="text-red-500">*</span></label>
                                <input type="email" id="reg-email" class="swal2-input !mx-0 !w-full !text-xs !h-9" placeholder="เช่น somchai@gmail.com">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2.5">
                            <div>
                                <label class="block font-semibold text-gray-600 mb-1">รหัสผ่าน <span class="text-red-500">*</span></label>
                                <input type="password" id="reg-password" class="swal2-input !mx-0 !w-full !text-xs !h-9" placeholder="รหัสผ่าน 6 ตัวขึ้นไป">
                            </div>
                            <div>
                                <label class="block font-semibold text-gray-600 mb-1">ยืนยันรหัสผ่าน <span class="text-red-500">*</span></label>
                                <input type="password" id="reg-confirm-password" class="swal2-input !mx-0 !w-full !text-xs !h-9" placeholder="พิมพ์อีกครั้ง">
                            </div>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">ประเภทบุคคล (Personnel Type) <span class="text-red-500">*</span></label>
                            <select id="reg-usertype" class="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-800 bg-white cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500">
                                <option value="" disabled selected>-- เลือกประเภทบุคคล --</option>
                                <option value="insource">Insource (บุคลากรภายใน)</option>
                                <option value="outsource">Outsource (บุคลากรภายนอก)</option>
                            </select>
                        </div>
                    </div>
                `,
                confirmButtonText: 'สมัครสมาชิก',
                confirmButtonColor: '#10b981',
                showCancelButton: true,
                cancelButtonText: 'ย้อนกลับไปล็อกอิน',
                cancelButtonColor: '#6b7280',
                reverseButtons: true,
                customClass: {
                    popup: 'rounded-2xl',
                    confirmButton: 'rounded-xl font-semibold !text-xs',
                    cancelButton: 'rounded-xl font-semibold !text-xs',
                },
                preConfirm: () => {
                    const fullName = document.getElementById('reg-fullname').value.trim();
                    const department = document.getElementById('reg-department').value.trim();
                    const phone = document.getElementById('reg-phone').value.trim();
                    const email = document.getElementById('reg-email').value.trim();
                    const password = document.getElementById('reg-password').value;
                    const confirmPassword = document.getElementById('reg-confirm-password').value;
                    const userType = document.getElementById('reg-usertype').value;
                    
                    if (!fullName || !department || !phone || !email || !password || !confirmPassword || !userType) {
                        Swal.showValidationMessage('กรุณากรอกข้อมูลและเลือกประเภทบุคคลให้ครบถ้วนทุกช่อง');
                        return false;
                    }
                    if (password.length < 6) {
                        Swal.showValidationMessage('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
                        return false;
                    }
                    if (password !== confirmPassword) {
                        Swal.showValidationMessage('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
                        return false;
                    }
                    
                    return {
                        fullName: fullName,
                        department: department,
                        phone: phone,
                        email: email,
                        password: password,
                        userType: userType
                    };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoading('กำลังลงทะเบียนบัญชีผู้ใช้...');
                    fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'registerUser',
                            payload: result.value
                        })
                    }).then(res => res.json())
                    .then(resData => {
                        hideLoading();
                        if (resData.status === 'success') {
                            Swal.fire({
                                icon: 'success',
                                title: 'สมัครสมาชิกสำเร็จ!',
                                text: 'คุณสามารถเข้าสู่ระบบด้วย อีเมล หรือ เบอร์โทรศัพท์ ได้ทันที',
                                confirmButtonText: 'ตกลง',
                                confirmButtonColor: '#10b981'
                            }).then(() => {
                                showLoginDialog();
                            });
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'ลงทะเบียนล้มเหลว',
                                text: resData.message || 'ข้อมูลไม่ถูกต้อง',
                                confirmButtonText: 'ลองใหม่'
                            }).then(() => {
                                showRegisterDialog();
                            });
                        }
                    }).catch(err => {
                        hideLoading();
                        console.error(err);
                        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
                    });
                } else if (result.dismiss === Swal.DismissReason.cancel) {
                    showLoginDialog();
                }
            });
        }

        function showLoginDialog(onSuccess = null) {
            Swal.fire({
                title: '<i class="fa-solid fa-lock text-blue-500 mr-2"></i>เข้าสู่ระบบ',
                html: `
                    <div class="space-y-3 text-left mt-1 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1.5">อีเมล หรือ เบอร์โทรศัพท์</label>
                            <input type="text" id="swal-username"
                                class="swal2-input !mx-0 !w-full !text-xs !h-9"
                                placeholder="ระบุอีเมลหรือเบอร์โทรศัพท์"
                                autocomplete="username">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1.5">รหัสผ่าน (Password)</label>
                            <input type="password" id="swal-password"
                                class="swal2-input !mx-0 !w-full !text-xs !h-9"
                                placeholder="••••••••"
                                autocomplete="current-password">
                        </div>
                        <div class="text-center pt-2">
                            <a href="#" onclick="event.preventDefault(); Swal.close(); showRegisterDialog();" class="text-xs text-blue-600 hover:text-blue-500 font-bold hover:underline">
                                <i class="fa-solid fa-user-plus mr-1"></i> ยังไม่มีบัญชี? สมัครสมาชิกใหม่
                            </a>
                        </div>
                    </div>
                `,
                confirmButtonText: '<i class="fa-solid fa-right-to-bracket mr-2"></i>เข้าสู่ระบบ',
                confirmButtonColor: '#2563eb',
                showCancelButton: true,
                cancelButtonText: 'ยกเลิก',
                cancelButtonColor: '#6b7280',
                reverseButtons: true,
                focusConfirm: false,
                customClass: {
                    popup: 'rounded-2xl',
                    confirmButton: 'rounded-xl font-semibold !text-xs',
                    cancelButton: 'rounded-xl font-semibold !text-xs',
                },
                didOpen: () => {
                    document.getElementById('swal-password').addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') Swal.clickConfirm();
                    });
                },
                showLoaderOnConfirm: true,
                preConfirm: () => {
                    const username = document.getElementById('swal-username').value.trim();
                    const password = document.getElementById('swal-password').value;
                    
                    if (!username || !password) {
                        Swal.showValidationMessage('กรุณากรอกทั้งข้อมูลชื่อผู้ใช้และรหัสผ่าน');
                        return false;
                    }
                    
                    return fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'loginUser',
                            payload: { username: username, password: password }
                        })
                    }).then(res => {
                        if (!res.ok) {
                            throw new Error('การเชื่อมต่อเซิร์ฟเวอร์ล้มเหลว');
                        }
                        return res.json();
                    }).then(resData => {
                        if (resData.status !== 'success') {
                            throw new Error(resData.message || 'อีเมล/เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง');
                        }
                        return resData.data; // User info object
                    }).catch(error => {
                        Swal.showValidationMessage(`<i class="fa-solid fa-circle-exclamation mr-2"></i>${error.message}`);
                    });
                },
                allowOutsideClick: () => !Swal.isLoading()
            }).then((result) => {
                if (result.isConfirmed && result.value) {
                    isLoggedIn = true;
                    currentUser = result.value; // Save full user object
                    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                    updateAuthUI();
                    showToast(`ยินดีต้อนรับ ${currentUser.fullName}!`, 'success');
                    if (onSuccess) onSuccess();
                }
            });
        }

        function logout() {
            confirmAction(`ยืนยันการออกจากระบบ?\nคุณจะกลับไปยังหน้าแคตตาล็อกสาธารณะ`, () => {
                isLoggedIn = false;
                currentUser = null;
                sessionStorage.removeItem('currentUser');
                updateAuthUI();
                switchView('view-catalog');
                document.querySelectorAll('.menu-item').forEach(el => {
                    el.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-900/20');
                    el.classList.add('text-gray-300');
                });
                const catalogBtn = document.querySelector('[onclick="switchView(\'view-catalog\', this)"]');
                if (catalogBtn) {
                    catalogBtn.classList.remove('text-gray-300');
                    catalogBtn.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-900/20');
                }
                showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
            });
        }

        function updateAuthUI() {
            document.querySelectorAll('.protected-nav-item').forEach(el => {
                if (!isLoggedIn) {
                    el.classList.add('hidden');
                } else {
                    const viewId = el.getAttribute('data-view');
                    if (viewId === 'divider-admin') {
                        el.classList.toggle('hidden', currentUser.role !== 'ADMIN' && currentUser.role !== 'Manager');
                    } else if (viewId === 'divider-pos') {
                        el.classList.remove('hidden');
                    } else {
                        el.classList.toggle('hidden', !hasAccess(viewId));
                    }
                }
            });
            
            initSettingsView();
            
            const dbBtn = document.querySelector('[onclick="initDatabase()"]');
            if (dbBtn) {
                dbBtn.classList.toggle('hidden', !isLoggedIn || currentUser.role !== 'ADMIN');
            }

            document.getElementById('auth-login-prompt').classList.toggle('hidden', isLoggedIn);
            document.getElementById('auth-user-info').classList.toggle('hidden', !isLoggedIn);
            if (isLoggedIn && currentUser) {
                let roleColor = 'bg-gray-500';
                if (currentUser.role === 'ADMIN') roleColor = 'bg-red-600';
                else if (currentUser.role === 'Manager') roleColor = 'bg-amber-600';
                else if (currentUser.role === 'Technician') roleColor = 'bg-purple-600';
                
                let userTypeLabel = '';
                if (currentUser.role !== 'ADMIN' && currentUser.role !== 'Manager') {
                    userTypeLabel = currentUser.userType === 'outsource' ? ' (Outsource)' : ' (Insource)';
                }
                
                document.getElementById('auth-username-display').innerHTML = `
                    <div class="flex flex-col text-left">
                        <span class="font-bold text-white text-xs truncate">${escapeHTML(currentUser.fullName)}</span>
                        <span class="text-[9px] text-gray-400 truncate mt-0.5">${escapeHTML(currentUser.department)}</span>
                        <div class="flex items-center gap-1 mt-1 flex-wrap">
                            <span class="text-[8px] font-extrabold text-white px-1.5 py-0.5 rounded ${roleColor} w-max uppercase">${currentUser.role}${userTypeLabel}</span>
                            ${currentUser.canApprove ? '<span class="text-[8px] font-extrabold text-emerald-300 bg-emerald-950/70 border border-emerald-500/50 px-1.5 py-0.5 rounded w-max" title="มีสิทธิ์อนุมัติเอกสาร"><i class="fa-solid fa-stamp mr-0.5 text-[7px]"></i>ผู้อนุมัติ</span>' : ''}
                        </div>
                    </div>
                `;
            } else {
                closeProductDetailModal();
                if (typeof closeProductMachinesModal === 'function') closeProductMachinesModal();
            }
            if (typeof db !== 'undefined' && db && db.products && db.products.length > 0) {
                renderCatalog();
            }
            if (typeof updateApprovalBadge === 'function') {
                updateApprovalBadge();
            }
        }

        // ===== SweetAlert2 Notification System =====
        const SwalToast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.onmouseenter = Swal.stopTimer;
                toast.onmouseleave = Swal.resumeTimer;
            }
        });

        function showLoading(text = 'กำลังโหลดข้อมูล...') {
            Swal.fire({
                title: text,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => { Swal.showLoading(); }
            });
        }

        function hideLoading() { Swal.close(); }

        function showToast(message, type = 'success') {
            const iconMap = { success: 'success', error: 'error', info: 'info' };
            SwalToast.fire({
                icon: iconMap[type] || 'success',
                title: message
            });
        }

        function confirmAction(message, callback) {
            Swal.fire({
                title: 'ยืนยันการดำเนินการ',
                html: escapeHTML(message).replace(/\n/g, '<br>'),
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc2626',
                cancelButtonColor: '#6b7280',
                confirmButtonText: '<i class="fa-solid fa-check mr-1"></i> ยืนยัน',
                cancelButtonText: 'ยกเลิก',
                reverseButtons: true,
                customClass: {
                    popup: 'rounded-2xl shadow-2xl',
                    confirmButton: 'rounded-xl font-semibold px-5',
                    cancelButton: 'rounded-xl font-semibold px-5',
                }
            }).then((result) => {
                if (result.isConfirmed) callback();
            });
        }

        // ===== Settings & User Management System =====

        function initSettingsView() {
            if (!isLoggedIn || !currentUser) return;
            
            const cardAdmin = document.getElementById('card-admin-user-mgmt');
            if (cardAdmin) cardAdmin.classList.toggle('hidden', !hasAccess('view-user-management'));
            
            const cardMapping = document.getElementById('card-settings-mapping');
            if (cardMapping) cardMapping.classList.toggle('hidden', !hasAccess('view-mapping'));
            
            const cardEditProducts = document.getElementById('card-settings-edit-products');
            if (cardEditProducts) cardEditProducts.classList.toggle('hidden', !hasAccess('view-edit-products'));
            
            const cardEditMapping = document.getElementById('card-settings-edit-mapping');
            if (cardEditMapping) cardEditMapping.classList.toggle('hidden', !hasAccess('view-edit-mapping'));

            const cardRestockHistory = document.getElementById('card-settings-restock-history');
            if (cardRestockHistory) cardRestockHistory.classList.toggle('hidden', !hasAccess('view-restock-history'));

            const cardManageManuals = document.getElementById('card-settings-manage-manuals');
            if (cardManageManuals) cardManageManuals.classList.toggle('hidden', !hasAccess('view-manage-manuals'));

            const cardMachines = document.getElementById('card-settings-machines');
            if (cardMachines) cardMachines.classList.toggle('hidden', !hasAccess('view-machines'));
        }

        function openSelfSettingsModal() {
            if (!isLoggedIn || !currentUser) return;
            
            document.getElementById('self_fullName').value = currentUser.fullName || '';
            document.getElementById('self_department').value = currentUser.department || '';
            document.getElementById('self_phone').value = currentUser.phone || '';
            document.getElementById('self_email').value = currentUser.email || '';
            
            document.getElementById('self_password').value = '';
            document.getElementById('self_confirmPassword').value = '';
            
            document.getElementById('selfSettingsModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeSelfSettingsModal() {
            document.getElementById('selfSettingsModal').classList.add('hidden');
            document.body.style.overflow = '';
        }

        async function submitSelfSettings(e) {
            e.preventDefault();
            if (!isLoggedIn || !currentUser) return;
            
            const fullName = document.getElementById('self_fullName').value.trim();
            const department = document.getElementById('self_department').value.trim();
            const phone = document.getElementById('self_phone').value.trim();
            const email = document.getElementById('self_email').value.trim();
            const password = document.getElementById('self_password').value;
            const confirmPassword = document.getElementById('self_confirmPassword').value;
            
            if (!fullName || !department || !phone || !email) {
                showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
                return;
            }
            
            if (password) {
                if (password.length < 6) {
                    showToast("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร", "error");
                    return;
                }
                if (password !== confirmPassword) {
                    showToast("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน", "error");
                    return;
                }
            }
            
            showLoading("กำลังบันทึกข้อมูลส่วนตัว...");
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'updateSelfProfile',
                        payload: {
                            currentEmail: currentUser.email,
                            fullName: fullName,
                            department: department,
                            phone: phone,
                            email: email,
                            password: password
                        }
                    })
                });
                const result = await res.json();
                hideLoading();
                
                if (result.status === 'success') {
                    currentUser = result.data;
                    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                    updateAuthUI();
                    closeSelfSettingsModal();
                    showToast("ปรับปรุงข้อมูลส่วนตัวของคุณเรียบร้อยแล้ว", "success");
                } else {
                    showToast(result.message || "ปรับปรุงข้อมูลล้มเหลว", "error");
                }
            } catch (err) {
                hideLoading();
                console.error(err);
                showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
            }
        }

        let allFetchedUsers = [];

        function openUserManagementModal() {
            switchView('view-user-management');
        }

        function closeUserManagementModal() {
            switchView('view-settings');
        }

        async function fetchAndRenderUsersList() {
            const tableBody = document.getElementById('usersListTableBody');
            if (!tableBody) return;
            
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-gray-500">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <div class="small-spinner"></div>
                            <span class="text-xs">กำลังโหลดรายชื่อผู้ใช้...</span>
                        </div>
                    </td>
                </tr>
            `;
            
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getUsersList',
                        payload: { requesterEmail: currentUser.email }
                    })
                });
                const result = await res.json();
                
                if (result.status === 'success') {
                    allFetchedUsers = result.data || [];
                    const searchInput = document.getElementById('user_management_search');
                    if (searchInput && searchInput.value.trim()) {
                        filterUsersListTable();
                    } else {
                        renderUsersListTable(allFetchedUsers);
                    }
                } else {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="7" class="p-8 text-center text-red-500 text-xs">ดึงข้อมูลล้มเหลว: ${escapeHTML(result.message)}</td>
                        </tr>
                    `;
                }
            } catch (err) {
                console.error(err);
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="p-8 text-center text-red-500 text-xs">เกิดข้อผิดพลาดในการโหลดข้อมูล</td>
                    </tr>
                `;
            }
        }

        function filterUsersListTable() {
            const searchVal = (document.getElementById('user_management_search')?.value || '').trim().toLowerCase();
            if (!searchVal) {
                renderUsersListTable(allFetchedUsers);
                return;
            }
            const filtered = allFetchedUsers.filter(u => {
                const name = (u.fullName || '').toLowerCase();
                const dept = (u.department || '').toLowerCase();
                const email = (u.email || '').toLowerCase();
                const phone = (u.phone || '').toLowerCase();
                const role = (u.role || '').toLowerCase();
                const approverStr = u.canApprove ? 'อนุมัติได้ approver มีสิทธิ์' : 'ไม่มีสิทธิ์';
                return name.includes(searchVal) || dept.includes(searchVal) || email.includes(searchVal) || phone.includes(searchVal) || role.includes(searchVal) || approverStr.includes(searchVal);
            });
            renderUsersListTable(filtered);
        }

        function renderUsersListTable(users) {
            const tableBody = document.getElementById('usersListTableBody');
            if (!tableBody) return;
            
            if (!users || users.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="p-8 text-center text-gray-500 text-xs">ไม่พบผู้ใช้งานในระบบ</td>
                    </tr>
                `;
                return;
            }
            
            tableBody.innerHTML = '';
            users.forEach(u => {
                let roleColor = 'bg-gray-100 text-gray-700';
                if (u.role === 'ADMIN') roleColor = 'bg-red-50 text-red-700 border border-red-150';
                else if (u.role === 'Manager') roleColor = 'bg-amber-50 text-amber-700 border border-amber-150';
                else if (u.role === 'Technician') roleColor = 'bg-purple-50 text-purple-700 border border-purple-150';
                
                let userTypeBadge = '';
                if (u.role !== 'ADMIN' && u.role !== 'Manager') {
                    const isOutsource = (u.userType === 'outsource');
                    userTypeBadge = isOutsource
                        ? `<span class="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">Outsource (ภายนอก)</span>`
                        : `<span class="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">Insource (ภายใน)</span>`;
                }

                const canApproveChecked = !!u.canApprove;
                const isSystemAdmin = u.email === 'nakyeet@gmail.com';

                let priceName = 'A (ราคากลาง)';
                if (u.priceLevel === 'B') priceName = 'B (ราคาตัวแทน)';
                else if (u.priceLevel === 'C') priceName = 'C (ราคาในเครือ)';
                else if (u.priceLevel === 'COST') priceName = 'COST (ราคาต้นทุน)';
                
                const isSelf = u.email === currentUser.email;
                
                const actionsHtml = isSystemAdmin
                    ? `<span class="text-[10px] text-gray-400 font-semibold italic">ผู้สร้างระบบ</span>`
                    : `
                        <div class="flex justify-center gap-2">
                            <button onclick="editUserRoleAndPrice('${escapeForJS(u.email)}', '${escapeForJS(u.role)}', '${escapeForJS(u.priceLevel || 'A')}', '${escapeForJS(u.userType || 'insource')}', ${canApproveChecked ? 'true' : 'false'})" class="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition rounded-lg text-xs font-semibold">
                                <i class="fa-solid fa-edit mr-1"></i> แก้ไข
                            </button>
                            ${isSelf ? '' : `
                            <button onclick="deleteUserByAdmin('${escapeForJS(u.email)}')" class="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition rounded-lg text-xs font-semibold">
                                <i class="fa-solid fa-trash-can mr-1"></i> ลบ
                            </button>
                            `}
                        </div>
                    `;

                const rowHtml = `
                    <tr class="hover:bg-slate-50 transition border-b border-gray-100">
                        <td class="px-4 py-3 font-semibold text-slate-800">${escapeHTML(u.fullName)}</td>
                        <td class="px-4 py-3 text-slate-500 text-xs">${escapeHTML(u.department)}</td>
                        <td class="px-4 py-3 text-xs font-mono text-slate-600">
                            <div><i class="fa-solid fa-phone text-slate-400 mr-1"></i>${escapeHTML(u.phone)}</div>
                            <div class="mt-0.5"><i class="fa-solid fa-envelope text-slate-400 mr-1"></i>${escapeHTML(u.email)}</div>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <div class="flex flex-col items-center justify-center">
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${roleColor}">${u.role}</span>
                                ${userTypeBadge}
                            </div>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <div class="inline-flex items-center justify-center">
                                <label class="relative inline-flex items-center cursor-pointer select-none group/toggle" title="คลิกติ๊กเพื่อเปิด/ปิดสิทธิ์อนุมัติเอกสาร">
                                    <input type="checkbox" ${canApproveChecked ? 'checked' : ''} 
                                           onchange="handleToggleApprovalPermission('${escapeForJS(u.email)}', this.checked, this)" 
                                           class="sr-only peer">
                                    <div class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                    <span class="toggle-label ml-2 text-xs font-semibold ${canApproveChecked ? 'text-emerald-700' : 'text-gray-400'}">
                                        ${canApproveChecked ? '<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>อนุมัติได้' : 'ไม่มีสิทธิ์'}
                                    </span>
                                </label>
                            </div>
                        </td>
                        <td class="px-4 py-3 text-center font-bold text-slate-700 text-xs">${priceName}</td>
                        <td class="px-4 py-3 text-center">${actionsHtml}</td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', rowHtml);
            });
        }

        async function handleToggleApprovalPermission(targetEmail, newCanApprove, checkboxEl) {
            if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'Manager')) {
                showToast("คุณไม่มีสิทธิ์จัดการข้อมูลผู้ใช้งาน", "error");
                if (checkboxEl) checkboxEl.checked = !newCanApprove;
                return;
            }

            const targetUser = allFetchedUsers.find(u => String(u.email).toLowerCase() === String(targetEmail).toLowerCase());
            const oldCanApprove = targetUser ? !!targetUser.canApprove : !newCanApprove;

            if (checkboxEl) checkboxEl.disabled = true;

            try {
                // Call API
                const res = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'updateUserApprovalPermission',
                        payload: {
                            requesterEmail: currentUser.email,
                            targetEmail: targetEmail,
                            canApprove: newCanApprove
                        }
                    })
                });
                const resData = await res.json();
                
                let isSuccess = (resData.status === 'success');
                // Fallback to updateUserByAdmin if action not found on older backend deployment
                if (!isSuccess && resData.message && (resData.message.includes('ไม่พบ') || resData.message.includes('Action'))) {
                    const fallbackRes = await fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'updateUserByAdmin',
                            payload: {
                                requesterEmail: currentUser.email,
                                targetEmail: targetEmail,
                                newRole: targetUser ? targetUser.role : 'user',
                                newPriceLevel: targetUser ? targetUser.priceLevel : 'A',
                                newUserType: targetUser ? targetUser.userType : 'insource',
                                canApprove: newCanApprove
                            }
                        })
                    });
                    const fallbackData = await fallbackRes.json();
                    isSuccess = (fallbackData.status === 'success');
                }

                if (isSuccess) {
                    if (targetUser) targetUser.canApprove = newCanApprove;
                    const labelSpan = checkboxEl?.parentElement?.querySelector('.toggle-label');
                    if (labelSpan) {
                        labelSpan.className = `toggle-label ml-2 text-xs font-semibold ${newCanApprove ? 'text-emerald-700' : 'text-gray-400'}`;
                        labelSpan.innerHTML = newCanApprove ? '<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>อนุมัติได้' : 'ไม่มีสิทธิ์';
                    }
                    if (currentUser && String(currentUser.email).toLowerCase() === String(targetEmail).toLowerCase()) {
                        currentUser.canApprove = newCanApprove;
                        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                        updateUserUI();
                    }
                    showToast(newCanApprove ? `เปิดสิทธิ์อนุมัติเอกสารให้ ${targetUser ? targetUser.fullName : targetEmail} แล้ว` : `ปิดสิทธิ์อนุมัติเอกสารของ ${targetUser ? targetUser.fullName : targetEmail} แล้ว`, 'success');
                } else {
                    throw new Error(resData.message || "อัปเดตสิทธิ์ล้มเหลว");
                }
            } catch (err) {
                console.error(err);
                showToast(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
                if (checkboxEl) {
                    checkboxEl.checked = oldCanApprove;
                    const labelSpan = checkboxEl.parentElement?.querySelector('.toggle-label');
                    if (labelSpan) {
                        labelSpan.className = `toggle-label ml-2 text-xs font-semibold ${oldCanApprove ? 'text-emerald-700' : 'text-gray-400'}`;
                        labelSpan.innerHTML = oldCanApprove ? '<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i>อนุมัติได้' : 'ไม่มีสิทธิ์';
                    }
                }
            } finally {
                if (checkboxEl) checkboxEl.disabled = false;
            }
        }

        function editUserRoleAndPrice(targetEmail, currentRole, currentPriceLevel, currentUserType, currentCanApprove) {
            const isNonAdminManager = (currentRole !== 'ADMIN' && currentRole !== 'Manager');
            const canApproveVal = (currentCanApprove === true || currentCanApprove === 'true');
            Swal.fire({
                title: 'แก้ไขสิทธิ์และระดับราคาสมาชิก',
                html: `
                    <div class="space-y-4 text-left mt-1 text-xs">
                        <div class="bg-slate-50 p-3 rounded-xl border border-gray-150 flex gap-2.5 items-center mb-3">
                            <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <div class="min-w-0">
                                <p class="text-[10px] text-gray-400">อีเมลผู้ใช้งาน</p>
                                <p class="font-mono font-bold text-slate-700 truncate">${escapeHTML(targetEmail)}</p>
                            </div>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1.5">สิทธิ์การใช้งาน (User Role)</label>
                            <select id="swal-edit-role" class="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-800 bg-white cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500">
                                <option value="user" ${currentRole === 'user' ? 'selected' : ''}>user (สมาชิกทั่วไป - POS & Catalog)</option>
                                <option value="Technician" ${currentRole === 'Technician' ? 'selected' : ''}>Technician (ช่างเทคนิค - POS & Catalog)</option>
                                <option value="Manager" ${currentRole === 'Manager' ? 'selected' : ''}>Manager (ผู้บริหารจัดการ - คลัง & ประวัติ)</option>
                                <option value="ADMIN" ${currentRole === 'ADMIN' ? 'selected' : ''}>ADMIN (ผู้ดูแลระบบสูงสุด)</option>
                            </select>
                        </div>
                        <div id="swal-user-type-box" class="${isNonAdminManager ? '' : 'hidden'}">
                            <label class="block font-semibold text-gray-600 mb-1.5">ประเภทบุคคล (Personnel Type)</label>
                            <select id="swal-edit-user-type" class="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-800 bg-white cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500">
                                <option value="insource" ${(currentUserType || 'insource') === 'insource' ? 'selected' : ''}>Insource (บุคลากรภายใน)</option>
                                <option value="outsource" ${(currentUserType || 'insource') === 'outsource' ? 'selected' : ''}>Outsource (บุคลากรภายนอก)</option>
                            </select>
                        </div>
                        <div class="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80">
                            <div class="flex items-center justify-between">
                                <div class="pr-2">
                                    <label for="swal-edit-can-approve" class="block font-bold text-gray-800 text-xs mb-0.5 cursor-pointer">
                                        <i class="fa-solid fa-stamp text-amber-600 mr-1"></i> สิทธิ์อนุมัติเอกสาร (Document Approver)
                                    </label>
                                    <p class="text-[10px] text-gray-500 leading-tight">ติ๊กเปิดเพื่อให้ผู้ใช้นี้สามารถกดอนุมัติเอกสารหรือใบเบิกในระบบได้</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer select-none flex-shrink-0">
                                    <input type="checkbox" id="swal-edit-can-approve" ${canApproveVal ? 'checked' : ''} class="sr-only peer">
                                    <div class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1.5">ระดับราคาสินค้าที่ได้รับ (Price Tier)</label>
                            <select id="swal-edit-price" class="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-800 bg-white cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500">
                                <option value="A" ${currentPriceLevel === 'A' ? 'selected' : ''}>ระดับ A (ราคากลาง / Standard)</option>
                                <option value="B" ${currentPriceLevel === 'B' ? 'selected' : ''}>ระดับ B (ราคาตัวแทน / Agent)</option>
                                <option value="C" ${currentPriceLevel === 'C' ? 'selected' : ''}>ระดับ C (ราคาในเครือ / Affiliate)</option>
                                <option value="COST" ${currentPriceLevel === 'COST' ? 'selected' : ''}>ระดับ COST (ราคาต้นทุน / Cost)</option>
                            </select>
                        </div>
                    </div>
                `,
                confirmButtonText: 'บันทึกการแก้ไข',
                confirmButtonColor: '#10b981',
                showCancelButton: true,
                cancelButtonText: 'ยกเลิก',
                cancelButtonColor: '#6b7280',
                reverseButtons: true,
                customClass: {
                    popup: 'rounded-2xl',
                    confirmButton: 'rounded-xl font-semibold !text-xs',
                    cancelButton: 'rounded-xl font-semibold !text-xs',
                },
                didOpen: () => {
                    const roleSelect = document.getElementById('swal-edit-role');
                    const typeBox = document.getElementById('swal-user-type-box');
                    if (roleSelect && typeBox) {
                        roleSelect.addEventListener('change', () => {
                            const selected = roleSelect.value;
                            if (selected === 'ADMIN' || selected === 'Manager') {
                                typeBox.classList.add('hidden');
                            } else {
                                typeBox.classList.remove('hidden');
                            }
                        });
                    }
                },
                preConfirm: () => {
                    const newRole = document.getElementById('swal-edit-role').value;
                    const newPrice = document.getElementById('swal-edit-price').value;
                    const typeSelect = document.getElementById('swal-edit-user-type');
                    const newUserType = (newRole === 'ADMIN' || newRole === 'Manager')
                        ? 'insource'
                        : (typeSelect ? typeSelect.value : 'insource');
                    const newCanApprove = document.getElementById('swal-edit-can-approve')?.checked || false;
                    return { newRole, newPrice, newUserType, newCanApprove };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    showLoading("กำลังปรับปรุงข้อมูลสิทธิ์สมาชิก...");
                    try {
                        const res = await fetch(API_URL, {
                            method: 'POST',
                            body: JSON.stringify({
                                action: 'updateUserByAdmin',
                                payload: {
                                    requesterEmail: currentUser.email,
                                    targetEmail: targetEmail,
                                    newRole: result.value.newRole,
                                    newPriceLevel: result.value.newPrice,
                                    newUserType: result.value.newUserType,
                                    canApprove: result.value.newCanApprove
                                }
                            })
                        });
                        const resData = await res.json();
                        hideLoading();
                        
                        if (resData.status === 'success') {
                            showToast("แก้ไขข้อมูลผู้ใช้สำเร็จ", "success");
                            if (currentUser && String(currentUser.email).toLowerCase() === String(targetEmail).toLowerCase()) {
                                currentUser.role = result.value.newRole;
                                currentUser.priceLevel = result.value.newPrice;
                                currentUser.userType = result.value.newUserType;
                                currentUser.canApprove = result.value.newCanApprove;
                                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                                updateUserUI();
                            }
                            fetchAndRenderUsersList();
                        } else {
                            showToast(resData.message || "ล้มเหลว", "error");
                        }
                    } catch (err) {
                        hideLoading();
                        console.error(err);
                        showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
                    }
                }
            });
        }

        function deleteUserByAdmin(targetEmail) {
            confirmAction(`คุณต้องการลบผู้ใช้งาน "${targetEmail}" ออกจากระบบใช่หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนคืนได้`, async () => {
                showLoading("กำลังลบผู้ใช้งาน...");
                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'deleteUserByAdmin',
                            payload: {
                                requesterEmail: currentUser.email,
                                targetEmail: targetEmail
                            }
                        })
                    });
                    const resData = await res.json();
                    hideLoading();
                    
                    if (resData.status === 'success') {
                        showToast("ลบผู้ใช้สำเร็จ", "success");
                        fetchAndRenderUsersList();
                    } else {
                        showToast(resData.message || "ล้มเหลว", "error");
                    }
                } catch (err) {
                    hideLoading();
                    console.error(err);
                    showToast("เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว", "error");
                }
            });
        }

        function closeConfirmModal() { Swal.close(); }

        async function initDatabase() {
            showLoading('กำลังตรวจสอบโครงสร้างฐานข้อมูล...');
            try {
                let res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'initDatabase' }) });
                let result = await res.json();
                showToast(result.message, result.status);
            } catch (error) { showToast('การเชื่อมต่อล้มเหลว', 'error'); }
            hideLoading();
        }

        const LS_CACHE_KEY = 'spareparts_cache_v1';
        const LS_CACHE_TTL = 5 * 60 * 1000; // 5 นาที (ms)

        async function fetchData(forceRefresh = false) {
            // ถ้าไม่ได้บังคับ refresh → ตรวจสอบ localStorage cache ก่อน
            if (!forceRefresh) {
                try {
                    const raw = localStorage.getItem(LS_CACHE_KEY);
                    if (raw) {
                        const cached = JSON.parse(raw);
                        const age = Date.now() - (cached.ts || 0);
                        const hasData = cached.data
                            && Array.isArray(cached.data.products)
                            && cached.data.products.length > 0;

                        if (age < LS_CACHE_TTL && hasData) {
                            // ข้อมูล cache ยังสดและไม่ว่าง → แสดงทันที
                            db = cached.data;
                            updateAllViews();
                            // ดึงข้อมูลใหม่เบื้องหลัง (ไม่แสดง spinner)
                            _fetchFromServer(true);
                            return;
                        }
                    }
                } catch(e) {
                    // localStorage มีปัญหา → ล้าง cache แล้วดึงใหม่
                    try { localStorage.removeItem(LS_CACHE_KEY); } catch(_) {}
                }
            }

            // ไม่มี cache / cache หมดอายุ / ข้อมูลว่าง → ดึงจาก server + แสดง spinner
            showLoading('กำลังดึงข้อมูลระบบ...');
            await _fetchFromServer(false);
        }

        async function _fetchFromServer(background = false) {
            try {
                const res = await fetch(API_URL + '?action=getAppData', { method: 'GET' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();

                // ตรวจสอบว่าข้อมูลที่ได้กลับมา valid ก่อน cache
                if (data && Array.isArray(data.products)) {
                    try {
                        localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
                    } catch(e) { /* storage full → ข้ามได้ */ }
                    db = data;
                    updateAllViews();
                } else {
                    throw new Error('ข้อมูลที่ได้รับไม่ถูกต้อง');
                }
            } catch (error) {
                if (!background) showToast('ไม่สามารถดึงข้อมูลได้: ' + error.message, 'error');
            }
            if (!background) hideLoading();
        }

        function updateAllViews() {
            // จัดเรียงรายการยกเลิกใช้ไปไว้ด้านล่างสุด
            if (db && Array.isArray(db.products)) {
                db.products.sort((a, b) => {
                    const aCancelled = a.note && (a.note.trim() === 'ยกเลิกใช้' || a.note.includes('ยกเลิกใช้'));
                    const bCancelled = b.note && (b.note.trim() === 'ยกเลิกใช้' || b.note.includes('ยกเลิกใช้'));
                    if (aCancelled && !bCancelled) return 1;
                    if (!aCancelled && bCancelled) return -1;
                    return 0;
                });
            }
            if (db && Array.isArray(db.machines)) {
                db.machines.sort((a, b) => {
                    const aCancelled = a.note && (a.note.trim() === 'ยกเลิกใช้' || a.note.includes('ยกเลิกใช้'));
                    const bCancelled = b.note && (b.note.trim() === 'ยกเลิกใช้' || b.note.includes('ยกเลิกใช้'));
                    if (aCancelled && !bCancelled) return 1;
                    if (!aCancelled && bCancelled) return -1;
                    return 0;
                });
            }

            // กรองเอาเฉพาะ mapping ที่มีเครื่องจักรและสินค้าอยู่จริงในระบบ ป้องกันข้อมูลไม่ตรงกันหลังการลบ
            if (db && Array.isArray(db.mappings)) {
                const machineIds = new Set(db.machines.map(m => String(m.id).trim()));
                const productIds = new Set(db.products.map(p => String(p.id).trim()));
                db.mappings = db.mappings.filter(m => 
                    machineIds.has(String(m.machine_id).trim()) && 
                    productIds.has(String(m.product_id).trim())
                );
            }
            
            // ซิงค์การตั้งค่าจากเซิร์ฟเวอร์
            if (db && db.settings) {
                isShowPriceBForGuest = db.settings.isShowPriceBForGuest === true;
                isShowPriceCForGuest = db.settings.isShowPriceCForGuest === true;
                
                const toggleB = document.getElementById('showGuestPriceBToggle');
                if (toggleB) toggleB.checked = isShowPriceBForGuest;
                
                const toggleC = document.getElementById('showGuestPriceCToggle');
                if (toggleC) toggleC.checked = isShowPriceCForGuest;
            }

            buildFilters();
            renderCatalog();
            renderMachineTable();
            renderEditProductTable();
            renderRestockTable();
            initMappingView(); 
            renderMappingTable();
            renderPublicManualsTable();
            renderManageManualsTable();
            populateDatalists();
        }

        function populateDatalists() {
            if (!db) return;
            
            // 0. ประเภทอะไหล่ (Product Categories)
            const productCategories = [...new Set(db.products.map(p => p.category).filter(Boolean))].sort();
            const dlProdCategories = document.getElementById('list_product_categories');
            if (dlProdCategories) {
                dlProdCategories.innerHTML = productCategories.map(c => `<option value="${escapeHTML(c)}">`).join('');
            }
            
            // 1. กลุ่มสินค้า (Product Groups)
            const productGroups = [...new Set(db.products.map(p => p.group).filter(Boolean))].sort();
            const dlProdGroups = document.getElementById('list_product_groups');
            if (dlProdGroups) {
                dlProdGroups.innerHTML = productGroups.map(g => `<option value="${escapeHTML(g)}">`).join('');
            }
            
            // 2. กลุ่มเครื่องจักร (Machine Groups)
            const machineGroups = [...new Set(db.machines.map(m => m.group).filter(Boolean))].sort();
            const dlMachGroups = document.getElementById('list_machine_groups');
            if (dlMachGroups) {
                dlMachGroups.innerHTML = machineGroups.map(g => `<option value="${escapeHTML(g)}">`).join('');
            }
            
            // 3. ซัพพลายเออร์ (Suppliers)
            const productSuppliers = [...new Set(db.products.map(p => p.supplier).filter(Boolean))].sort();
            const dlProdSuppliers = document.getElementById('list_product_suppliers');
            if (dlProdSuppliers) {
                dlProdSuppliers.innerHTML = productSuppliers.map(s => `<option value="${escapeHTML(s)}">`).join('');
            }
            
            const machineSuppliers = [...new Set(db.machines.map(m => m.supplier).filter(Boolean))].sort();
            const dlMachSuppliers = document.getElementById('list_machine_suppliers');
            if (dlMachSuppliers) {
                dlMachSuppliers.innerHTML = machineSuppliers.map(s => `<option value="${escapeHTML(s)}">`).join('');
            }
            
            // 4. พื้นที่จัดเก็บ (Storage Area)
            const productStorages = [...new Set(db.products.map(p => p.storage).filter(Boolean))].sort();
            const dlProdStorages = document.getElementById('list_product_storages');
            if (dlProdStorages) {
                dlProdStorages.innerHTML = productStorages.map(s => `<option value="${escapeHTML(s)}">`).join('');
            }
            
            const machineStorages = [...new Set(db.machines.map(m => m.storage).filter(Boolean))].sort();
            const dlMachStorages = document.getElementById('list_machine_storages');
            if (dlMachStorages) {
                dlMachStorages.innerHTML = machineStorages.map(s => `<option value="${escapeHTML(s)}">`).join('');
            }
        }

        function buildFilters() {
            const mapCatSelect = document.getElementById('map_category_filter');
            if(mapCatSelect) {
                mapCatSelect.innerHTML = '<option value="all">-- ทุกประเภทอะไหล่ --</option>';
                const categories = [...new Set(db.products.map(p => p.category))].filter(c => c && c.trim() !== '');
                categories.sort();
                categories.forEach(c => mapCatSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`));
            }

            const mapMachSelect = document.getElementById('filterMappingMachine');
            if (mapMachSelect) {
                mapMachSelect.innerHTML = '<option value="all">-- ทุกเครื่องจักร --</option>';
                db.machines.forEach(m => mapMachSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(m.id)}">${escapeHTML(m.id)} : ${escapeHTML(m.name)}</option>`));
            }

            catalogCategories = [...new Set(db.products.map(p => p.category))].filter(c => c && c.trim() !== '');
            catalogCategories.sort();
            catalogMachines = db.machines;
            
            if(!document.getElementById('filterCategory').value) document.getElementById('filterCategory').value = 'all';
            if(!document.getElementById('filterMachine').value) document.getElementById('filterMachine').value = 'all';
        }
