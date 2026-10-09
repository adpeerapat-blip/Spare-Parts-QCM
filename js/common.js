/**
 * ====================================================================
 * Spare Parts QCM - Common Module (js/common.js)
 * ====================================================================
 * Core configuration, authentication, multi-language dictionary,
 * notifications, navigation, system settings, and data synchronization.
 */

const API_URL = 'https://script.google.com/macros/s/AKfycby4-NV1kd0YHLMvvFRG_ByGfYMg80KCM8n9fS4pn6JMrGa7hKG2oOR3H1brsQDtrcs1/exec';
const FIREBASE_DB_URL = 'https://pricelist-qcm-default-rtdb.asia-southeast1.firebasedatabase.app/.json';
const LS_CACHE_KEY = 'spareparts_qcm_cache_v1';

// ป้องกันปัญหาแคชค้างจากโปรเจกต์อื่น (เช่น LDT) บน origin/localhost เดียวกัน
try {
    localStorage.removeItem('spareparts_cache_v1');
} catch (_) {}


function ensureArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') {
        if (val.email || val.transaction_id || (val.id && val.name)) {
            return [val];
        }
        return Object.keys(val)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => val[k]);
    }
    return [];
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getFormattedDateTimeString() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function invalidateLocalCache() {
    try {
        localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ data: db, ts: Date.now() }));
    } catch(e) {}
}
        
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

            const cardBackup = document.getElementById('card-settings-backup');
            if (cardBackup) {
                const isAdmin = isLoggedIn && currentUser && currentUser.role === 'ADMIN';
                cardBackup.classList.toggle('hidden', !isAdmin);
            }
        }

        async function runManualBackup(type) {
            if (!isLoggedIn || !currentUser || currentUser.role !== 'ADMIN') {
                showToast('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้', 'error');
                return;
            }
            
            const action = type === 'json' ? 'backupFirebaseToDrive' : 'backupFirebaseToSheets';
            const titleMsg = type === 'json' ? 'สำรองข้อมูล Firebase -> JSON Drive' : 'สำรองข้อมูล Firebase -> Google Sheet';
            
            const htmlContent = `
                <div class="text-left text-xs space-y-2 max-h-60 overflow-y-auto p-2 border border-slate-100 rounded-2xl">
                    <p class="text-slate-500 mb-2 font-medium">กรุณาเลือกประเภทข้อมูลที่ต้องการสำรอง:</p>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-products" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">📦 ข้อมูลสินค้าและอะไหล่ (Products)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-machines" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">⚙️ เครื่องจักร (Machines)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-mappings" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">🔗 การจับคู่สินค้า-เครื่องจักร (Mappings)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-transactions" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">📝 ประวัติการทำรายการ (Transactions)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-lots" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">📊 ประวัติล็อตสินค้า (Lots)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-manuals" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">📚 คู่มือการใช้งาน (Manuals)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-users" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">👥 ข้อมูลผู้ใช้งาน (Users)</span>
                    </label>
                    <label class="flex items-center space-x-2.5 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" id="backup-settings" checked class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-slate-700">🔧 การตั้งค่าระบบ (Settings)</span>
                    </label>
                </div>
            `;
                
            const result = await Swal.fire({
                title: titleMsg,
                html: htmlContent,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#6b7280',
                confirmButtonText: 'ยืนยันการสำรองข้อมูล',
                cancelButtonText: 'ยกเลิก',
                customClass: {
                    popup: 'rounded-3xl max-w-sm',
                    confirmButton: 'rounded-xl font-semibold !text-[11px]',
                    cancelButton: 'rounded-xl font-semibold !text-[11px]',
                },
                preConfirm: () => {
                    const targets = [];
                    const keys = ['products', 'machines', 'mappings', 'transactions', 'lots', 'manuals', 'users', 'settings'];
                    keys.forEach(k => {
                        const el = document.getElementById('backup-' + k);
                        if (el && el.checked) {
                            targets.push(k);
                        }
                    });
                    
                    if (targets.length === 0) {
                        Swal.showValidationMessage('กรุณาเลือกข้อมูลอย่างน้อย 1 รายการ');
                        return false;
                    }
                    return targets;
                }
            });
            
            if (result.isConfirmed && result.value) {
                showLoading('กำลังสำรองข้อมูล กรุณารอสักครู่...');
                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: action,
                            payload: { 
                                requesterEmail: currentUser.email,
                                targets: result.value
                            }
                        })
                    });
                    
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const resData = await res.json();
                    
                    if (resData.status === 'success') {
                        showToast(resData.message || 'สำรองข้อมูลสำเร็จ', 'success');
                    } else {
                        throw new Error(resData.message || 'เกิดข้อผิดพลาดในการสำรองข้อมูล');
                    }
                } catch (error) {
                    showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
                } finally {
                    hideLoading();
                }
            }
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

        // LS_CACHE_KEY is defined globally at top of file
        let isFirebaseListenerInitialized = false;
        let firebaseListenerPromise = null;
        let resolveFirstFetch = null;

        async function fetchData(forceRefresh = false) {
            // 1. ดึงข้อมูลจาก Cache ใน LocalStorage ขึ้นมาแสดงก่อนทันทีเพื่อความรวดเร็ว
            try {
                const raw = localStorage.getItem(LS_CACHE_KEY);
                if (raw) {
                    const cached = JSON.parse(raw);
                    const hasData = cached.data
                        && Array.isArray(cached.data.products)
                        && cached.data.products.length > 0;
                    if (hasData) {
                        db = cached.data;
                        updateAllViews();
                    }
                }
            } catch (e) {
                try { localStorage.removeItem(LS_CACHE_KEY); } catch(_) {}
            }

            // 2. ถ้ามีการกด Force Refresh หรือแอปยังไม่มีข้อมูลเลย ให้แสดง loading
            const hasNoData = !db || !db.products || db.products.length === 0;
            if (forceRefresh || hasNoData) {
                showLoading('กำลังซิงค์ข้อมูลระบบ...');
            }

            // 3. เริ่มต้นเปิด Real-time Listener (ถ้ายังไม่ได้รัน)
            if (!isFirebaseListenerInitialized) {
                isFirebaseListenerInitialized = true;
                
                firebaseListenerPromise = new Promise((resolve, reject) => {
                    resolveFirstFetch = resolve;
                    
                    try {
                        // ใช้ Firebase Realtime Database SDK เพื่อเปิดฟังข้อมูลแบบ Real-time (WebSocket)
                        firebase.database().ref().on('value', async (snapshot) => {
                            try {
                                const fbData = snapshot.val();
                                let hasValidData = false;
                                if (fbData) {
                                    const appDataNode = fbData.appData || {};
                                    const allUsers = ensureArray(fbData.users);
                                    const approvers = allUsers.filter(u => !!u.canApprove).map(u => ({
                                        fullName: u.fullName || "",
                                        email: u.email || "",
                                        department: u.department || "",
                                        role: u.role || "User"
                                    }));

                                    const consolidated = {
                                        products: ensureArray(appDataNode.products),
                                        machines: ensureArray(appDataNode.machines),
                                        mappings: ensureArray((fbData.mappings && Object.keys(fbData.mappings).length > 0) ? fbData.mappings : appDataNode.mappings),
                                        settings: appDataNode.settings || {},
                                        manuals: ensureArray(appDataNode.manuals),
                                        lots: ensureArray((fbData.lots && Object.keys(fbData.lots).length > 0) ? fbData.lots : appDataNode.lots),
                                        approvers: approvers
                                    };

                                    if (consolidated.products && consolidated.products.length > 0) {
                                        db = consolidated;
                                        invalidateLocalCache();
                                        updateAllViews();
                                        hasValidData = true;
                                    }
                                }

                                if (!hasValidData && (!db || !db.products || db.products.length === 0)) {
                                    console.warn("Firebase ยังไม่มีข้อมูล กำลังดึงข้อมูลจาก Google Apps Script Backup...");
                                    await _fetchFromBackupServer();
                                }
                            } catch (err) {
                                console.error("Error in Firebase real-time listener callback:", err);
                            } finally {
                                if (resolveFirstFetch) {
                                    resolveFirstFetch();
                                    resolveFirstFetch = null;
                                }
                                hideLoading();
                            }
                        }, (fbErr) => {
                            console.warn("Real-time sync failed. Falling back to Google Apps Script:", fbErr);
                            _fetchFromBackupServer().then(resolve).catch(reject);
                        });
                    } catch (err) {
                        console.error("Firebase SDK Listener Setup Error:", err);
                        _fetchFromBackupServer().then(resolve).catch(reject);
                    }
                });
            } else {
                if (forceRefresh) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    hideLoading();
                    showToast('ข้อมูลเป็นปัจจุบันแล้ว');
                }
            }

            if (firebaseListenerPromise) {
                await firebaseListenerPromise;
            }
        }

        async function _fetchFromBackupServer() {
            try {
                const res = await fetch(API_URL + '?action=getAppData', { method: 'GET' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                
                if (data && Array.isArray(data.products)) {
                    db = data;
                    invalidateLocalCache();
                    updateAllViews();
                } else {
                    throw new Error('ข้อมูลที่ได้รับไม่ถูกต้อง');
                }
            } catch (error) {
                showToast('ไม่สามารถดึงข้อมูลได้: ' + error.message, 'error');
            }
            hideLoading();
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


// ==========================================
// Firebase Direct Backend Bypass Interceptor
// ==========================================

const BYPASS_ACTIONS = [
    'editProduct',
    'editMachine',
    'editManual',
    'getTransactions',
    'checkoutOrder',
    'restockProduct',
    'cancelTransaction',
    'updateApprovalStatus',
    'deleteTransaction',
    'addMapping',
    'deleteMapping',
    'saveSettings',
    'getUsersList',
    'loginUser',
    'registerUser',
    'updateUserByAdmin',
    'deleteUserByAdmin',
    'updateSelfProfile'
];

async function handleActionDirectlyOnFirebase(action, payload) {
    try {
        switch (action) {
            case 'editProduct':
                await executeDirectEditProduct(payload);
                return { status: 'success', message: 'บันทึกแก้ไขสินค้าสำเร็จ' };
            case 'editMachine':
                await executeDirectEditMachine(payload);
                return { status: 'success', message: 'บันทึกแก้ไขเครื่องจักรสำเร็จ' };
            case 'editManual':
                const manualRes = await executeDirectEditManual(payload);
                return { status: 'success', data: manualRes, message: 'บันทึกแก้ไขคู่มือสำเร็จ' };
            case 'getTransactions':
                return { status: 'success', data: await executeDirectGetTransactions() };
            case 'loginUser':
                return { status: 'success', data: await executeDirectLogin(payload) };
            case 'registerUser':
                await executeDirectRegister(payload);
                return { status: 'success', message: 'สมัครสมาชิกสำเร็จ รอการอนุมัติสิทธิ์' };
            case 'getUsersList':
                return { status: 'success', data: await executeDirectGetUsersList(payload) };
            case 'updateUserByAdmin':
                await executeDirectUpdateUserByAdmin(payload);
                return { status: 'success', message: 'อัปเดตข้อมูลผู้ใช้สำเร็จ' };
            case 'deleteUserByAdmin':
                await executeDirectDeleteUserByAdmin(payload);
                return { status: 'success', message: 'ลบผู้ใช้สำเร็จ' };
            case 'updateSelfProfile':
                return { status: 'success', data: await executeDirectUpdateSelfProfile(payload), message: 'อัปเดตโปรไฟล์สำเร็จ' };
            case 'checkoutOrder':
                return { status: 'success', data: await executeDirectCheckout(payload), message: 'บันทึกใบเบิกและหักสต็อกสำเร็จ' };
            case 'restockProduct':
                return { status: 'success', data: await executeDirectRestock(payload), message: 'เติมสต็อกสำเร็จ' };
            case 'cancelTransaction':
                await executeDirectCancelTransaction(payload);
                return { status: 'success', message: 'ยกเลิกใบเบิกและคืนสต็อกสำเร็จ' };
            case 'updateApprovalStatus':
                const appRes = await executeDirectUpdateApprovalStatus(payload);
                return { status: 'success', data: appRes, message: payload.approval_status === 'Approved' ? 'อนุมัติเอกสารสำเร็จ' : (payload.approval_status === 'Rejected' ? 'ปฏิเสธเอกสารและคืนสต็อกสำเร็จ' : 'บันทึกการแก้ไขรายการอะไหล่สำเร็จ') };
            case 'deleteTransaction':
                await executeDirectDeleteTransaction(payload);
                return { status: 'success', message: 'ลบประวัติใบเบิกสำเร็จ' };
            case 'addMapping':
                await executeDirectAddMapping(payload);
                return { status: 'success', message: 'บันทึกการจับคู่สำเร็จ' };
            case 'deleteMapping':
                await executeDirectDeleteMapping(payload);
                return { status: 'success', message: 'ลบการจับคู่สำเร็จ' };
            case 'saveSettings':
                await executeDirectSaveSettings(payload);
                return { status: 'success', message: 'บันทึกการตั้งค่าสำเร็จ' };
            default:
                throw new Error("Action not supported directly on Firebase");
        }
    } catch (e) {
        return { status: 'error', message: e.message };
    }
}

let transactionsCache = null;

async function executeDirectEditProduct(payload) {
    const snapshot = await firebase.database().ref('appData/products').get();
    let products = ensureArray(snapshot.val());
    const index = products.findIndex(p => String(p.id).trim() === String(payload.id).trim());
    if (index === -1) throw new Error("ไม่พบรหัสสินค้าที่ต้องการแก้ไข");
    const oldProduct = products[index];
    const cost = parseFloat(payload.cost) || 0;
    
    const pA = parseFloat(payload.price_a) > 0 ? parseFloat(payload.price_a) : Math.ceil(cost * 2.1);
    const pB = parseFloat(payload.price_b) > 0 ? parseFloat(payload.price_b) : Math.ceil(cost * 1.7);
    const pC = parseFloat(payload.price_c) > 0 ? parseFloat(payload.price_c) : Math.ceil(cost * 1.3);
    const stockQty = (payload.stock_qty !== undefined && payload.stock_qty !== "") ? parseFloat(payload.stock_qty) : (parseFloat(oldProduct.stock_qty) || 0);
    
    products[index] = {
        id: payload.id, name: payload.name, unit: payload.unit, cost: cost,
        price_a: pA, price_b: pB, price_c: pC,
        category: payload.category, note: payload.note, image_url: oldProduct.image_url || "",
        stock_qty: stockQty, group: payload.group || "", supplier: payload.supplier || "", storage: payload.storage || ""
    };
    await firebase.database().ref('appData/products').set(products);
    db.products = products;
    invalidateLocalCache();
}

async function executeDirectEditMachine(payload) {
    const snapshot = await firebase.database().ref('appData/machines').get();
    let machines = ensureArray(snapshot.val());
    const index = machines.findIndex(m => String(m.id).trim() === String(payload.id).trim());
    if (index === -1) throw new Error("ไม่พบเครื่องจักรที่ต้องการแก้ไข");
    const oldMachine = machines[index];
    machines[index] = {
        id: payload.id, name: payload.name, image_url: oldMachine.image_url || "", cost: parseFloat(payload.cost) || 0,
        price_a: parseFloat(payload.price_a) || 0, price_b: parseFloat(payload.price_b) || 0, price_c: parseFloat(payload.price_c) || 0,
        note: payload.note || "", group: payload.group || "", supplier: payload.supplier || "", storage: payload.storage || ""
    };
    await firebase.database().ref('appData/machines').set(machines);
    db.machines = machines;
    invalidateLocalCache();
}

async function executeDirectEditManual(payload) {
    const snapshot = await firebase.database().ref('appData/manuals').get();
    let manuals = ensureArray(snapshot.val());
    const index = manuals.findIndex(m => String(m.id).trim() === String(payload.id).trim());
    if (index === -1) throw new Error("ไม่พบคู่มือที่ต้องการแก้ไข");
    const oldManual = manuals[index];
    manuals[index] = {
        id: payload.id, title: payload.title || "", description: payload.description || "",
        file_url: oldManual.file_url || "", file_type: payload.file_type || oldManual.file_type,
        uploaded_at: oldManual.uploaded_at || ""
    };
    await firebase.database().ref('appData/manuals').set(manuals);
    db.manuals = manuals;
    invalidateLocalCache();
    return { file_url: oldManual.file_url || "" };
}

async function executeDirectGetTransactions() {
    if (transactionsCache) {
        return transactionsCache;
    }
    const snapshot = await firebase.database().ref('transactions').get();
    transactionsCache = ensureArray(snapshot.val()).reverse();
    return transactionsCache;
}

function getDefaultUsersList() {
    return [
        {
            fullName: "Admin Nakyeet",
            department: "IT",
            phone: "0999999999",
            email: "nakyeet@gmail.com",
            passwordHash: "15e2b0d3c33891ebb0f1ef609ec419420c20e320ce94c65fbc8c3312448eb225", // SHA-256 for "123456789"
            role: "ADMIN",
            priceLevel: "A",
            userType: "insource",
            canApprove: true
        }
    ];
}

async function executeDirectLogin(payload) {
    const username = String(payload.username).trim().toLowerCase();
    const password = String(payload.password);
    if (!username || !password) throw new Error("กรุณากรอกข้อมูลการเข้าสู่ระบบ");
    
    const snapshot = await firebase.database().ref('users').get();
    let users = ensureArray(snapshot.val());
    if (users.length === 0) {
        users = getDefaultUsersList();
        await firebase.database().ref('users').set(users);
    } else if (!users.some(u => String(u.email || "").toLowerCase() === 'nakyeet@gmail.com')) {
        users.push(...getDefaultUsersList());
        await firebase.database().ref('users').set(users);
    }

    const hash = await sha256(password);
    
    const user = users.find(u => (String(u.email || "").toLowerCase() === username || String(u.phone || "").trim() === username));
    if (!user) throw new Error("ไม่พบชื่อผู้ใช้ (อีเมลหรือเบอร์โทรศัพท์) ในระบบ");
    if (user.passwordHash !== hash) throw new Error("รหัสผ่านไม่ถูกต้อง");
    
    return {
        fullName: user.fullName,
        department: user.department,
        phone: user.phone,
        email: user.email,
        role: user.role,
        priceLevel: user.priceLevel || "A",
        userType: user.userType || "insource",
        canApprove: !!user.canApprove
    };
}

async function executeDirectRegister(payload) {
    const fullName = String(payload.fullName || "").trim();
    const department = String(payload.department || "").trim();
    const phone = String(payload.phone || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const userType = payload.userType ? String(payload.userType).trim() : "";
    if (!fullName || !department || !phone || !email || !password || !userType) {
        throw new Error("กรุณากรอกข้อมูลและเลือกประเภทบุคคลให้ครบถ้วน");
    }
    
    const snapshot = await firebase.database().ref('users').get();
    let users = ensureArray(snapshot.val());
    if (users.length === 0) {
        users = getDefaultUsersList();
    }
    
    if (users.some(u => String(u.email || "").toLowerCase() === email)) throw new Error("อีเมลนี้ถูกใช้สมัครสมาชิกแล้ว");
    if (users.some(u => String(u.phone || "").trim() === phone)) throw new Error("เบอร์โทรศัพท์นี้ถูกใช้สมัครสมาชิกแล้ว");
    
    const newUser = {
        fullName: fullName,
        department: department,
        phone: phone,
        email: email,
        passwordHash: await sha256(password),
        role: "user",
        priceLevel: "A",
        userType: userType,
        canApprove: false
    };
    users.push(newUser);
    await firebase.database().ref('users').set(users);
    invalidateLocalCache();
}

async function executeDirectGetUsersList(payload) {
    const snapshot = await firebase.database().ref('users').get();
    let users = ensureArray(snapshot.val());
    if (users.length === 0) {
        users = getDefaultUsersList();
        await firebase.database().ref('users').set(users);
    }
    return users;
}

async function executeDirectUpdateUserByAdmin(payload) {
    const email = String(payload.targetEmail || payload.email || "").trim().toLowerCase();
    const snapshot = await firebase.database().ref('users').get();
    const users = ensureArray(snapshot.val());
    
    const index = users.findIndex(u => String(u.email || "").toLowerCase() === email);
    if (index === -1) throw new Error("ไม่พบอีเมลผู้ใช้ที่ต้องการแก้ไข");
    
    users[index].fullName = String(payload.fullName || users[index].fullName).trim();
    users[index].department = String(payload.department || users[index].department).trim();
    users[index].phone = String(payload.phone || users[index].phone).trim();
    users[index].role = String(payload.newRole || payload.role || users[index].role).trim();
    users[index].priceLevel = String(payload.newPriceLevel || payload.priceLevel || users[index].priceLevel || "A").trim();
    users[index].userType = String(payload.newUserType || payload.userType || users[index].userType || "insource").trim();
    if (payload.canApprove !== undefined) {
        users[index].canApprove = !!payload.canApprove;
    }
    
    if (payload.password) {
        users[index].passwordHash = await sha256(payload.password);
    }
    await firebase.database().ref('users').set(users);
    invalidateLocalCache();
}

async function executeDirectDeleteUserByAdmin(payload) {
    const email = String(payload.targetEmail || payload.email || "").trim().toLowerCase();
    const snapshot = await firebase.database().ref('users').get();
    let users = ensureArray(snapshot.val());
    
    users = users.filter(u => String(u.email || "").toLowerCase() !== email);
    await firebase.database().ref('users').set(users);
    invalidateLocalCache();
}

async function executeDirectUpdateSelfProfile(payload) {
    const currentEmail = String(payload.currentEmail || "").trim().toLowerCase();
    const snapshot = await firebase.database().ref('users').get();
    const users = ensureArray(snapshot.val());
    
    const index = users.findIndex(u => String(u.email || "").toLowerCase() === currentEmail);
    if (index === -1) throw new Error("ไม่พบข้อมูลบัญชีผู้ใช้ในระบบ");
    
    const newEmail = String(payload.email || "").trim().toLowerCase();
    if (newEmail !== currentEmail && users.some(u => String(u.email || "").toLowerCase() === newEmail)) {
        throw new Error("อีเมลใหม่นี้ถูกใช้งานแล้ว");
    }
    
    users[index].fullName = String(payload.fullName || users[index].fullName).trim();
    users[index].department = String(payload.department || users[index].department).trim();
    users[index].phone = String(payload.phone || users[index].phone).trim();
    users[index].email = newEmail;
    
    if (payload.password) {
        users[index].passwordHash = await sha256(payload.password);
    }
    
    await firebase.database().ref('users').set(users);
    invalidateLocalCache();
    
    return {
        fullName: users[index].fullName,
        department: users[index].department,
        phone: users[index].phone,
        email: users[index].email,
        role: users[index].role,
        priceLevel: users[index].priceLevel || "A",
        userType: users[index].userType || "insource",
        canApprove: !!users[index].canApprove
    };
}

async function executeDirectCheckout(payload) {
    const snapshot = await firebase.database().ref().get();
    const fbData = snapshot.val() || {};
    
    let products = ensureArray(fbData.appData?.products);
    let lots = ensureArray(fbData.lots);
    let transactions = ensureArray(fbData.transactions);
    
    const cart = payload.cart;
    const prodMap = {};
    products.forEach(p => { prodMap[String(p.id).trim()] = p; });
    
    // ตรวจสอบสต็อก
    cart.forEach(item => {
        const pId = String(item.id).trim();
        const product = prodMap[pId];
        if (!product) throw new Error("ไม่พบอะไหล่รหัส " + pId + " ในระบบ");
        
        const stockQty = parseFloat(product.stock_qty) || 0;
        if (stockQty < item.qty) {
            throw new Error("สต็อกไม่เพียงพอ: อะไหล่ " + (product.name || pId) + " (" + pId + ") มีคงเหลือ " + stockQty + " ชิ้น แต่พยายามเบิก " + item.qty + " ชิ้น");
        }
        
        const prodLots = lots.filter(l => String(l.product_id).trim() === pId && (parseFloat(l.remaining_qty) || 0) > 0);
        const totalLotQty = prodLots.reduce((sum, l) => sum + (parseFloat(l.remaining_qty) || 0), 0);
        if (totalLotQty < stockQty) {
            const diff = stockQty - totalLotQty;
            lots.push({
                lot_id: "LOT-SUPP-" + pId + "-" + Date.now(),
                product_id: pId,
                cost: parseFloat(product.cost) || 0,
                price_a: parseFloat(product.price_a) || 0,
                price_b: parseFloat(product.price_b) || 0,
                price_c: parseFloat(product.price_c) || 0,
                initial_qty: diff,
                remaining_qty: diff,
                created_at: getFormattedDateTimeString(),
                note: "Lot สำรองคงเหลือ"
            });
        }
    });
    
    // ตัดสต็อก FIFO
    const checkoutItems = [];
    cart.forEach(item => {
        const pId = String(item.id).trim();
        const product = prodMap[pId];
        let neededQty = item.qty;
        
        const availableLots = lots.filter(l => String(l.product_id).trim() === pId && (parseFloat(l.remaining_qty) || 0) > 0)
                                  .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        
        availableLots.forEach(lot => {
            if (neededQty <= 0) return;
            const remaining = parseFloat(lot.remaining_qty) || 0;
            const takeQty = Math.min(remaining, neededQty);
            
            lot.remaining_qty = remaining - takeQty;
            neededQty -= takeQty;
            
            let lotPrice = item.price;
            if (item.priceLevel === 'A' && lot.price_a) lotPrice = parseFloat(lot.price_a) || 0;
            else if (item.priceLevel === 'B' && lot.price_b) lotPrice = parseFloat(lot.price_b) || 0;
            else if (item.priceLevel === 'C' && lot.price_c) lotPrice = parseFloat(lot.price_c) || 0;
            
            checkoutItems.push({
                detail_id: "",
                product_id: pId,
                lot_id: lot.lot_id,
                qty: takeQty,
                unit_cost: parseFloat(lot.cost) || 0,
                price: lotPrice,
                subtotal: takeQty * lotPrice
            });
        });
        
        product.stock_qty = (parseFloat(product.stock_qty) || 0) - item.qty;
    });
    
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datePrefix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const dateStr = getFormattedDateTimeString();
    
    let counter = 1;
    if (transactions.length > 0) {
        for (let i = transactions.length - 1; i >= 0; i--) {
            const lastTx = transactions[i];
            if (lastTx && lastTx.id && String(lastTx.id).indexOf("QCM-" + datePrefix) === 0) {
                const parts = String(lastTx.id).split("-");
                const lastNum = parseInt(parts[2], 10);
                if (!isNaN(lastNum)) {
                    counter = lastNum + 1;
                    break;
                }
            }
        }
    }
    const txId = "QCM-" + datePrefix + "-" + String(counter).padStart(4, '0');
    
    let calcTotalPrice = 0;
    checkoutItems.forEach((it, idx) => {
        it.detail_id = txId + "-" + (idx + 1);
        calcTotalPrice += it.subtotal;
    });
    
    const laborCost = parseFloat(payload.labor_cost) || 0;
    const partsTotal = parseFloat(payload.parts_total) || calcTotalPrice;
    const grandTotal = parseFloat(payload.total_price) || (calcTotalPrice + laborCost);
    
    const newTransaction = {
        id: txId,
        date: dateStr,
        requester: payload.requester || "",
        department: payload.department || "",
        approver: payload.approver || "",
        approver_email: payload.approver_email || "",
        customer_type: payload.customer_type || "",
        price_tier: payload.price_tier || "",
        machine_model: payload.machine_model || "",
        repair_level: payload.repair_level || "",
        labor_cost: laborCost,
        parts_total: partsTotal,
        machine_id: payload.machine_id,
        serial_number: payload.serial_number || "",
        total_price: grandTotal,
        note: payload.note || "",
        job_details: payload.job_details || "",
        status: "Success",
        approval_status: payload.approval_status || "Pending",
        items: checkoutItems
    };
    transactions.push(newTransaction);
    
    const updates = {};
    updates["appData/products"] = products;
    updates["lots"] = lots;
    updates["transactions"] = transactions;
    await firebase.database().ref().update(updates);
    transactionsCache = null;
    
    db.products = products;
    db.lots = lots;
    db.transactions = transactions;
    invalidateLocalCache();
    
    return { transaction_id: txId, items: checkoutItems };
}

async function executeDirectRestock(payload) {
    const snapshot = await firebase.database().ref().get();
    const fbData = snapshot.val() || {};
    
    let products = ensureArray(fbData.appData?.products);
    let lots = ensureArray(fbData.lots);
    let transactions = ensureArray(fbData.transactions);
    
    const pId = String(payload.id).trim();
    const product = products.find(p => String(p.id).trim() === pId);
    if (!product) throw new Error("ไม่พบของที่ต้องการปรับปรุงสต็อก");
    
    const qty = parseFloat(payload.qty) || 0;
    const cost = (payload.cost !== undefined && payload.cost !== "") ? parseFloat(payload.cost) : (parseFloat(product.cost) || 0);
    const pA = (payload.price_a !== undefined && payload.price_a !== "") ? parseFloat(payload.price_a) : (parseFloat(product.price_a) || 0);
    const pB = (payload.price_b !== undefined && payload.price_b !== "") ? parseFloat(payload.price_b) : (parseFloat(product.price_b) || 0);
    const pC = (payload.price_c !== undefined && payload.price_c !== "") ? parseFloat(payload.price_c) : (parseFloat(product.price_c) || 0);
    
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datePrefix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const dateStr = getFormattedDateTimeString();
    
    const lotId = "LOT-" + datePrefix + "-" + String(Date.now()).slice(-6);
    lots.push({
        lot_id: lotId,
        product_id: pId,
        cost: cost,
        price_a: pA,
        price_b: pB,
        price_c: pC,
        initial_qty: qty,
        remaining_qty: qty,
        created_at: dateStr,
        note: payload.note || "เติมสต็อกอะไหล่"
    });
    
    const currentStock = parseFloat(product.stock_qty) || 0;
    const newStock = currentStock + qty;
    product.stock_qty = newStock;
    product.cost = cost;
    product.price_a = pA;
    product.price_b = pB;
    product.price_c = pC;
    
    let counter = 1;
    if (transactions.length > 0) {
        for (let i = transactions.length - 1; i >= 0; i--) {
            const lastTx = transactions[i];
            if (lastTx && lastTx.id && String(lastTx.id).indexOf("QCM-RE-" + datePrefix) === 0) {
                const parts = String(lastTx.id).split("-");
                const lastNum = parseInt(parts[3], 10);
                if (!isNaN(lastNum)) {
                    counter = lastNum + 1;
                    break;
                }
            }
        }
    }
    const txId = "QCM-RE-" + datePrefix + "-" + String(counter).padStart(4, '0');
    
    const newRestockTx = {
        id: txId,
        date: dateStr,
        requester: payload.requester || "ระบบเติมสต็อก",
        department: payload.department || "สโตร์ (Restock)",
        machine_id: "",
        serial_number: "",
        total_price: qty * cost,
        note: payload.note || ("เติมสต็อก (Lot: " + lotId + ")"),
        status: "Restock",
        items: [{
            detail_id: txId + "-1",
            product_id: pId,
            lot_id: lotId,
            qty: qty,
            unit_cost: cost,
            price: pA,
            subtotal: qty * cost
        }]
    };
    transactions.push(newRestockTx);
    
    const updates = {};
    updates["appData/products"] = products;
    updates["lots"] = lots;
    updates["transactions"] = transactions;
    await firebase.database().ref().update(updates);
    transactionsCache = null;
    
    db.products = products;
    db.lots = lots;
    db.transactions = transactions;
    invalidateLocalCache();
    
    return { new_stock: newStock, transaction_id: txId, lot_id: lotId };
}

async function executeDirectCancelTransaction(payload) {
    const snapshot = await firebase.database().ref().get();
    const fbData = snapshot.val() || {};
    
    let products = ensureArray(fbData.appData?.products);
    let lots = ensureArray(fbData.lots);
    let transactions = ensureArray(fbData.transactions);
    
    const txId = String(payload.transaction_id).trim();
    const tx = transactions.find(t => String(t.id).trim() === txId);
    if (!tx) throw new Error("ไม่พบรายการใบเบิกที่ต้องการยกเลิก");
    if (tx.status === "Cancelled") throw new Error("ใบเบิกนี้ถูกยกเลิกไปแล้ว");
    
    // คืนสต็อก
    if (Array.isArray(tx.items)) {
        tx.items.forEach(it => {
            const pId = String(it.product_id).trim();
            const product = products.find(p => String(p.id).trim() === pId);
            if (product) {
                product.stock_qty = (parseFloat(product.stock_qty) || 0) + (parseFloat(it.qty) || 0);
            }
            if (it.lot_id) {
                const targetLot = lots.find(l => String(l.lot_id).trim() === String(it.lot_id).trim());
                if (targetLot) {
                    targetLot.remaining_qty = (parseFloat(targetLot.remaining_qty) || 0) + (parseFloat(it.qty) || 0);
                }
            }
        });
    }
    
    tx.status = "Cancelled";
    
    const updates = {};
    updates["appData/products"] = products;
    updates["lots"] = lots;
    updates["transactions"] = transactions;
    await firebase.database().ref().update(updates);
    transactionsCache = null;
    
    db.products = products;
    db.lots = lots;
    db.transactions = transactions;
    invalidateLocalCache();
}

async function executeDirectUpdateApprovalStatus(payload) {
    const snapshot = await firebase.database().ref().get();
    const fbData = snapshot.val() || {};
    
    let products = ensureArray(fbData.appData?.products);
    let lots = ensureArray(fbData.lots);
    let transactions = ensureArray(fbData.transactions);
    
    const txId = String(payload.transaction_id).trim();
    const txIndex = transactions.findIndex(t => String(t.id).trim() === txId);
    if (txIndex === -1) throw new Error("ไม่พบรหัสใบเบิก " + txId);
    
    const targetTx = transactions[txIndex];
    if (targetTx.approval_status === "Approved" || targetTx.approval_status === "Rejected") {
        throw new Error("เอกสารนี้ได้รับการพิจารณาไปแล้ว (" + targetTx.approval_status + ")");
    }
    
    const newStatus = payload.approval_status;
    const note = payload.approval_note || "";
    const approverName = payload.approved_by || "";
    const approverEmail = payload.approved_by_email || "";
    const dateStr = getFormattedDateTimeString();
    const hasUpdatedItems = Array.isArray(payload.updated_items) && payload.updated_items.length > 0;
    
    if (newStatus === "Rejected") {
        targetTx.approval_status = "Rejected";
        targetTx.approval_date = dateStr;
        targetTx.approval_by = approverName;
        targetTx.approval_by_email = approverEmail;
        targetTx.approval_note = note;
        targetTx.status = "Cancelled";
        
        // คืนสต็อกและล็อตเดิม
        if (Array.isArray(targetTx.items)) {
            targetTx.items.forEach(it => {
                const pId = String(it.product_id).trim();
                const product = products.find(p => String(p.id).trim() === pId);
                if (product) {
                    product.stock_qty = (parseFloat(product.stock_qty) || 0) + (parseFloat(it.qty) || 0);
                }
                if (it.lot_id) {
                    const targetLot = lots.find(l => String(l.lot_id).trim() === String(it.lot_id).trim());
                    if (targetLot) {
                        targetLot.remaining_qty = (parseFloat(targetLot.remaining_qty) || 0) + (parseFloat(it.qty) || 0);
                    }
                }
            });
        }
    } else {
        // 'Approved' หรือ 'Pending' (แก้ไขรายการ)
        if (hasUpdatedItems) {
            // 1. คืนสต็อกและล็อตเดิมชั่วคราวก่อนคำนวณใหม่
            if (Array.isArray(targetTx.items)) {
                targetTx.items.forEach(oldItem => {
                    const oldPid = String(oldItem.product_id).trim();
                    const oldProd = products.find(p => String(p.id).trim() === oldPid);
                    if (oldProd) {
                        oldProd.stock_qty = (parseFloat(oldProd.stock_qty) || 0) + (parseFloat(oldItem.qty) || 0);
                    }
                    if (oldItem.lot_id) {
                        const targetLot = lots.find(l => String(l.lot_id).trim() === String(oldItem.lot_id).trim());
                        if (targetLot) {
                            targetLot.remaining_qty = (parseFloat(targetLot.remaining_qty) || 0) + (parseFloat(oldItem.qty) || 0);
                        }
                    }
                });
            }
            
            // 2. ตรวจสอบสต็อกสำหรับรายการใหม่
            const prodMap = {};
            products.forEach(p => { prodMap[String(p.id).trim()] = p; });
            
            payload.updated_items.forEach(item => {
                const pId = String(item.product_id || item.id).trim();
                const q = parseFloat(item.qty) || 0;
                if (q <= 0) throw new Error("จำนวนอะไหล่ต้องมากกว่า 0");
                const product = prodMap[pId];
                if (!product) throw new Error("ไม่พบรหัสสินค้า " + pId + " ในระบบ");
                if ((parseFloat(product.stock_qty) || 0) < q) {
                    throw new Error("สต็อกไม่เพียงพอสำหรับ " + (product.name || pId));
                }
            });
            
            // 3. หักสต็อกและจัดสรร Lot ใหม่
            const newItems = [];
            payload.updated_items.forEach(item => {
                const pId = String(item.product_id || item.id).trim();
                const product = prodMap[pId];
                let neededQty = parseFloat(item.qty) || 0;
                
                const availableLots = lots.filter(l => String(l.product_id).trim() === pId && (parseFloat(l.remaining_qty) || 0) > 0)
                                          .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
                
                availableLots.forEach(lot => {
                    if (neededQty <= 0) return;
                    const remaining = parseFloat(lot.remaining_qty) || 0;
                    const takeQty = Math.min(remaining, neededQty);
                    
                    lot.remaining_qty = remaining - takeQty;
                    neededQty -= takeQty;
                    
                    const price = parseFloat(item.price) || (parseFloat(lot.price_a) || 0);
                    newItems.push({
                        detail_id: targetTx.id + "-" + (newItems.length + 1),
                        product_id: pId,
                        lot_id: lot.lot_id,
                        qty: takeQty,
                        unit_cost: parseFloat(lot.cost) || 0,
                        price: price,
                        subtotal: takeQty * price
                    });
                });
                
                product.stock_qty = (parseFloat(product.stock_qty) || 0) - (parseFloat(item.qty) || 0);
            });
            
            const calcPartsTotal = newItems.reduce((sum, it) => sum + (it.subtotal || 0), 0);
            const laborCost = parseFloat(targetTx.labor_cost) || 0;
            targetTx.items = newItems;
            targetTx.parts_total = calcPartsTotal;
            targetTx.total_price = calcPartsTotal + laborCost;
        }
        
        targetTx.approval_status = newStatus;
        targetTx.approval_date = dateStr;
        targetTx.approval_by = approverName;
        targetTx.approval_by_email = approverEmail;
        targetTx.approval_note = note;
    }
    
    const updates = {};
    updates["appData/products"] = products;
    updates["lots"] = lots;
    updates["transactions"] = transactions;
    await firebase.database().ref().update(updates);
    transactionsCache = null;
    
    db.products = products;
    db.lots = lots;
    db.transactions = transactions;
    invalidateLocalCache();
    
    return { status: "success", transaction: targetTx };
}

async function executeDirectDeleteTransaction(payload) {
    const txId = String(payload.transaction_id || payload.id).trim();
    const snapshot = await firebase.database().ref('transactions').get();
    let transactions = ensureArray(snapshot.val());
    transactions = transactions.filter(t => String(t.id).trim() !== txId);
    await firebase.database().ref('transactions').set(transactions);
    transactionsCache = null;
    db.transactions = transactions;
    invalidateLocalCache();
}

async function executeDirectAddMapping(payload) {
    const snapshot = await firebase.database().ref('mappings').get();
    let mappings = ensureArray(snapshot.val());
    const machId = String(payload.machine_id).trim();
    const prodId = String(payload.product_id).trim();
    if (!mappings.some(m => String(m.machine_id).trim() === machId && String(m.product_id).trim() === prodId)) {
        mappings.push({ machine_id: machId, product_id: prodId });
        await firebase.database().ref('mappings').set(mappings);
        db.mappings = mappings;
        invalidateLocalCache();
    }
}

async function executeDirectDeleteMapping(payload) {
    const snapshot = await firebase.database().ref('mappings').get();
    let mappings = ensureArray(snapshot.val());
    const machId = String(payload.machine_id).trim();
    const prodId = String(payload.product_id).trim();
    mappings = mappings.filter(m => !(String(m.machine_id).trim() === machId && String(m.product_id).trim() === prodId));
    await firebase.database().ref('mappings').set(mappings);
    db.mappings = mappings;
    invalidateLocalCache();
}

async function executeDirectSaveSettings(payload) {
    const snapshot = await firebase.database().ref('appData/settings').get();
    let settings = snapshot.val() || {};
    settings.isShowPriceBForGuest = Boolean(payload.isShowPriceBForGuest);
    settings.isShowPriceCForGuest = Boolean(payload.isShowPriceCForGuest);
    await firebase.database().ref('appData/settings').set(settings);
    db.settings = settings;
    invalidateLocalCache();
}

// Global Fetch Interceptor to bypass Apps Script
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    if (typeof url === 'string' && url.includes(API_URL) && options && options.method === 'POST') {
        try {
            const body = JSON.parse(options.body);
            const action = body.action;
            const payload = body.payload;
            
            if (BYPASS_ACTIONS.includes(action)) {
                // If there's an image/file upload, let it go to Apps Script
                if (action === 'editProduct' && payload && payload.imageBase64) {
                    console.log("[Firebase Bypass] editProduct has image, letting Apps Script handle it.");
                } else if (action === 'editMachine' && payload && payload.imageBase64) {
                    console.log("[Firebase Bypass] editMachine has image, letting Apps Script handle it.");
                } else if (action === 'editManual' && payload && payload.file_url && payload.file_url.indexOf("data:") === 0) {
                    console.log("[Firebase Bypass] editManual has file payload, letting Apps Script handle it.");
                } else {
                    console.log("[Firebase Bypass] Intercepting action: " + action);
                    const result = await handleActionDirectlyOnFirebase(action, payload);
                    return new Response(JSON.stringify(result), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
        } catch (e) {
            console.error("Fetch interceptor parse error: ", e);
        }
    }
    return originalFetch.apply(this, arguments);
};

console.log("[Firebase Bypass] Interceptor activated successfully.");
