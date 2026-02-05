// 1. Import Firebase SDKs (Updated to v12.9.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc } 
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// 2. YOUR NEW CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyDi8JNCO8-Mt4noUodmTl4oe14Y4IfcABA",
    authDomain: "med-os-b2b07.firebaseapp.com",
    projectId: "med-os-b2b07",
    storageBucket: "med-os-b2b07.firebasestorage.app",
    messagingSenderId: "839220828885",
    appId: "1:839220828885:web:3586e328b8281eb697a05c"
};

// Initialize Database
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// =================================================================
// 3. GLOBAL VARIABLES
// =================================================================
window.admins = [];
window.doctorsData = [];
window.patientsData = [];
window.emergencyData = [];
window.billsData = [];
window.pharmacyData = [];
window.hospitalConfig = { name: "City General Hospital", address: "123 Main St" };

// Session State
window.currentUser = null; 
let itemToDelete = null; 
let currentEditingId = null;
let currentBillMeds = []; 
let editingBillMeds = [];
let pendingAuthAction = null; 
let pendingBillId = null;
let patientChart = null;
let financeChart = null;

// =================================================================
// 4. INITIALIZATION
// =================================================================
window.onload = async function() {
    await loadDataFromDB();
    document.getElementById('view-login').style.display = 'flex';
    
    if(document.getElementById('conf-hosp-name')) document.getElementById('conf-hosp-name').value = window.hospitalConfig.name;
    if(document.getElementById('conf-hosp-addr')) document.getElementById('conf-hosp-addr').value = window.hospitalConfig.address;
};

async function loadDataFromDB() {
    console.log("Syncing with Database...");
    
    const loadCol = async (name) => {
        try {
            const snap = await getDocs(collection(db, name));
            return snap.docs.map(d => ({ ...d.data(), firebaseId: d.id }));
        } catch (e) {
            console.error(`Error loading ${name}:`, e);
            return [];
        }
    };

    window.admins = await loadCol("admins");
    window.patientsData = await loadCol("patients");
    window.doctorsData = await loadCol("doctors");
    window.emergencyData = await loadCol("emergency");
    window.billsData = await loadCol("bills");
    window.pharmacyData = await loadCol("pharmacy");

    // Create default admin if database is empty (New Database Setup)
    if (window.admins.length === 0) {
        const defAdmin = { id: 'IJAZ', pass: '123456' };
        await addDoc(collection(db, "admins"), defAdmin);
        window.admins.push(defAdmin);
    }

    if(window.currentUser) window.updateHomeStats();
}

// =================================================================
// 5. AUTHENTICATION
// =================================================================
window.handleLogin = function() {
    const id = document.getElementById('login-id').value;
    const pass = document.getElementById('login-pass').value;
    
    const validAdmin = window.admins.find(a => a.id === id && a.pass === pass);
    const isMasterKey = (id === 'IJAZ' && pass === '123456');

    if (validAdmin || isMasterKey) {
        window.currentUser = id;
        document.getElementById('current-admin-display').innerText = window.currentUser;
        
        document.getElementById('view-login').classList.remove('active', '!flex');
        setTimeout(() => {
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('app-wrapper').classList.remove('hidden');
            window.updateDoctorDropdown();
            window.navigateTo('home');
            window.updateHomeStats();
        }, 300);
    } else {
        window.showToast('Invalid Admin ID or Password');
    }
};

window.requestAuth = function(callback) {
    pendingAuthAction = callback;
    document.getElementById('verify-admin-pass').value = '';
    document.getElementById('password-verify-modal').classList.remove('hidden');
};

window.submitPasswordVerify = function() {
    const pass = document.getElementById('verify-admin-pass').value;
    const admin = window.admins.find(a => a.id === window.currentUser);
    if((admin && admin.pass === pass) || pass === '123456') {
        const actionToRun = pendingAuthAction;
        window.closePasswordModal();
        if(actionToRun) actionToRun();
    } else {
        window.showToast("Incorrect Password");
    }
};

window.closePasswordModal = function() {
    document.getElementById('password-verify-modal').classList.add('hidden');
    pendingAuthAction = null;
};

window.openLogoutConfirm = function() {
    document.getElementById('logout-confirm-modal').classList.remove('hidden');
};

window.closeLogoutConfirm = function() {
    document.getElementById('logout-confirm-modal').classList.add('hidden');
};

window.executeLogout = function() {
    window.closeLogoutConfirm();
    document.getElementById('app-wrapper').classList.add('hidden');
    const login = document.getElementById('view-login');
    login.style.display = 'flex';
    login.classList.add('!flex');
    setTimeout(() => login.classList.add('active'), 50);
    document.getElementById('login-id').value = '';
    document.getElementById('login-pass').value = '';
    window.currentUser = null;
    window.showToast('Logged out successfully');
};

// =================================================================
// 6. CORE DATABASE ACTIONS
// =================================================================

// --- PATIENTS ---
window.savePatient = async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const now = new Date();
    
    let initialSymptoms = formData.get('symptoms');
    if(initialSymptoms) initialSymptoms = `[${now.toLocaleDateString()}] ${initialSymptoms}`;

    const newPatient = {
        id: `P${Date.now().toString().slice(-6)}`,
        token: window.patientsData.length + 1,
        name: `${formData.get('firstName')} ${formData.get('lastName')}`,
        mobile: formData.get('mobile'),
        address: formData.get('address'),
        symptoms: initialSymptoms, 
        doctor: formData.get('doctor'),
        ward: formData.get('ward'),
        status: formData.get('status'),
        prescriptions: ""
    };

    const docRef = await addDoc(collection(db, "patients"), newPatient);
    window.patientsData.push({ ...newPatient, firebaseId: docRef.id });

    const initialFee = formData.get('initialFee');
    if(initialFee && initialFee > 0) {
        window.generateBill(newPatient.name, newPatient.id, initialFee, "Registration / Consultation Fee");
    }
    
    window.showToast(`Patient Registered! Token: ${newPatient.token}`);
    document.getElementById('new-patient-form').reset();
    setTimeout(() => window.navigateTo('patient-list'), 800);
};

window.updatePatientDetails = async function() {
    const p = window.patientsData.find(x => x.id === currentEditingId);
    if(p && p.firebaseId) {
        p.name = document.getElementById('edit-detail-name').value;
        p.mobile = document.getElementById('edit-detail-mobile').value;
        p.address = document.getElementById('edit-detail-address').value;
        p.prescriptions = document.getElementById('edit-detail-prescriptions').value;
        
        await updateDoc(doc(db, "patients", p.firebaseId), {
            name: p.name, mobile: p.mobile, address: p.address, prescriptions: p.prescriptions
        });

        window.showToast('Records Updated');
        window.safeToggle('edit-patient-modal', true);
        window.renderExistingPatients();
    }
};

window.updatePatientStatus = async function(id, newStatus) {
    const p = window.patientsData.find(x => x.id === id);
    if(p && p.firebaseId) {
        p.status = newStatus;
        await updateDoc(doc(db, "patients", p.firebaseId), { status: newStatus });
        window.showToast(`Status updated to ${newStatus}`);
        window.updateHomeStats();
    }
};

window.appendSymptom = async function() {
    const newEntry = document.getElementById('new-symptom-entry').value;
    if(!newEntry) return;

    const p = window.patientsData.find(x => x.id === currentEditingId);
    if(p && p.firebaseId) {
        const timestamp = new Date().toLocaleString();
        const entryStr = `\n[${timestamp}] ${newEntry}`;
        p.symptoms = (p.symptoms || '') + entryStr;
        await updateDoc(doc(db, "patients", p.firebaseId), { symptoms: p.symptoms });
        document.getElementById('symptoms-history').innerText = p.symptoms;
        document.getElementById('new-symptom-entry').value = '';
    }
};

// --- DOCTORS ---
window.saveDoctor = async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newDoc = {
        id: `D-${Date.now().toString().slice(-4)}`, 
        name: formData.get('docName'),
        department: formData.get('docDept'),
        qualification: formData.get('docQual'),
        workDays: formData.get('docDays'),
        workTime: formData.get('docTime'),
        mobile: formData.get('docMobile'),
        status: formData.get('docStatus')
    };
    
    const docRef = await addDoc(collection(db, "doctors"), newDoc);
    window.doctorsData.push({ ...newDoc, firebaseId: docRef.id });

    window.updateDoctorDropdown();
    window.safeToggle('add-doctor-modal', true);
    e.target.reset();
    window.showToast('Staff Added Successfully');
    window.renderDoctors();
};

window.updateDoctorDetails = async function() {
    const id = document.getElementById('edit-doc-id').value;
    const docData = window.doctorsData.find(d => d.id === id);
    if (docData && docData.firebaseId) {
        docData.name = document.getElementById('edit-doc-name').value;
        docData.department = document.getElementById('edit-doc-dept').value;
        docData.qualification = document.getElementById('edit-doc-qual').value;
        docData.workDays = document.getElementById('edit-doc-days').value;
        docData.workTime = document.getElementById('edit-doc-time').value;
        docData.mobile = document.getElementById('edit-doc-mobile').value;
        docData.status = document.getElementById('edit-doc-status').value;

        await updateDoc(doc(db, "doctors", docData.firebaseId), {
            name: docData.name, department: docData.department, qualification: docData.qualification,
            workDays: docData.workDays, workTime: docData.workTime, mobile: docData.mobile, status: docData.status
        });

        window.renderDoctors();
        window.renderAttendance();
        window.updateDoctorDropdown();
        window.showToast('Staff Details Updated');
        window.safeToggle('edit-doctor-modal', true);
    }
};

window.toggleAttendance = async function(index, newStatus) {
    const d = window.doctorsData[index];
    if(d && d.firebaseId) {
        d.status = newStatus;
        await updateDoc(doc(db, "doctors", d.firebaseId), { status: newStatus });
        window.renderAttendance();
        window.updateHomeStats();
    }
};

// --- MEDICINE ---
window.saveMedicine = async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newMed = {
        id: `MED-${Date.now().toString().slice(-4)}`,
        name: formData.get('medName'),
        category: formData.get('medCategory'),
        price: parseFloat(formData.get('medPrice')),
        stock: parseInt(formData.get('medStock')),
        expiry: formData.get('medExpiry'),
        manufacturer: formData.get('medManuf') || '',
        batch: formData.get('medBatch') || '',
        dosage: formData.get('medDose') || ''
    };
    
    const docRef = await addDoc(collection(db, "pharmacy"), newMed);
    window.pharmacyData.push({ ...newMed, firebaseId: docRef.id });
    
    window.renderPharmacy();
    window.safeToggle('add-medicine-modal', true);
    e.target.reset();
    window.showToast('Medicine Added');
};

window.updateMedicineDetails = async function() {
    const id = document.getElementById('edit-med-id').value;
    const med = window.pharmacyData.find(m => m.id === id);
    if(med && med.firebaseId) {
        med.name = document.getElementById('edit-med-name').value;
        med.category = document.getElementById('edit-med-category').value;
        med.price = parseFloat(document.getElementById('edit-med-price').value);
        med.manufacturer = document.getElementById('edit-med-manuf').value;
        med.batch = document.getElementById('edit-med-batch').value;
        med.dosage = document.getElementById('edit-med-dose').value;
        med.stock = parseInt(document.getElementById('edit-med-stock').value);
        med.expiry = document.getElementById('edit-med-expiry').value;

        await updateDoc(doc(db, "pharmacy", med.firebaseId), {
            name: med.name, category: med.category, price: med.price,
            manufacturer: med.manufacturer, batch: med.batch, dosage: med.dosage,
            stock: med.stock, expiry: med.expiry
        });

        window.renderPharmacy();
        window.showToast('Medicine Updated');
        window.safeToggle('edit-medicine-modal', true);
    }
};

// --- BILLING ---
window.generateBill = async function(patientName, id, amount, desc, medicines = []) {
    const bill = {
        id: `INV-${Date.now().toString().slice(-6)}`,
        patientName: patientName,
        patientId: id,
        date: new Date().toLocaleDateString(),
        description: desc || 'Consultation / Registration',
        amount: parseFloat(amount) || 0,
        medicines: medicines,
        status: 'Pending',
        method: '-'
    };
    const docRef = await addDoc(collection(db, "bills"), bill);
    window.billsData.push({ ...bill, firebaseId: docRef.id });
};

window.saveManualBill = async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const patientSelect = document.getElementById('bill-patient-select');
    
    if (!patientSelect.value) { window.showToast('Select a patient'); return; }

    const patientName = patientSelect.options[patientSelect.selectedIndex].getAttribute('data-name');
    
    await window.generateBill(
        patientName,
        formData.get('billPatientId'),
        formData.get('billAmount'),
        formData.get('billDesc') || 'Medical Services & Pharmacy',
        currentBillMeds
    );
    
    window.safeToggle('add-bill-modal', true);
    e.target.reset();
    window.renderBilling();
    window.showToast('Invoice Generated');
};

window.updateBillDetails = async function() {
    const id = document.getElementById('edit-bill-id').value;
    const bill = window.billsData.find(b => b.id === id);
    
    if(bill && bill.firebaseId) {
        bill.description = document.getElementById('edit-bill-desc').value;
        bill.amount = parseFloat(document.getElementById('edit-bill-amount').value);
        bill.status = document.getElementById('edit-bill-status').value;
        bill.medicines = editingBillMeds; 
        if(bill.status === 'Pending') bill.method = '-';
        
        await updateDoc(doc(db, "bills", bill.firebaseId), {
            description: bill.description, amount: bill.amount,
            status: bill.status, medicines: bill.medicines, method: bill.method
        });

        window.renderBilling();
        window.updateHomeStats();
        window.showToast('Invoice Updated');
        window.safeToggle('edit-bill-modal', true);
    }
};

window.confirmPayment = async function() {
    if(!pendingBillId) return;
    const method = document.getElementById('payment-method-select').value;
    const bill = window.billsData.find(b => b.id === pendingBillId);
    
    if(bill && bill.firebaseId) {
        bill.status = 'Paid';
        bill.method = method;
        await updateDoc(doc(db, "bills", bill.firebaseId), { status: 'Paid', method: method });
        window.renderBilling();
        window.updateHomeStats();
        window.showToast(`Invoice ${bill.id} Paid`);
    }
    window.safeToggle('payment-modal', true);
    pendingBillId = null;
};

// --- EMERGENCY ---
window.saveEmergencyPatient = async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newEm = {
        id: Date.now().toString().slice(-5),
        name: formData.get('emName'),
        age: formData.get('emAge'),
        gender: formData.get('emGender'),
        complaint: formData.get('emComplaint'),
        priority: formData.get('emPriority')
    };
    
    const docRef = await addDoc(collection(db, "emergency"), newEm);
    window.emergencyData.push({ ...newEm, firebaseId: docRef.id });

    window.renderEmergencyList();
    window.safeToggle('add-emergency-modal', true);
    e.target.reset();
    window.showToast('Emergency Patient Admitted');
};

// --- NEW EMERGENCY EDIT FUNCTIONS ---
window.openEditEmergencyModal = function(id) {
    const em = window.emergencyData.find(e => e.id === id);
    if(!em) return;
    
    document.getElementById('edit-em-id').value = em.id;
    document.getElementById('edit-em-name').value = em.name;
    document.getElementById('edit-em-age').value = em.age;
    document.getElementById('edit-em-gender').value = em.gender;
    document.getElementById('edit-em-complaint').value = em.complaint;
    document.getElementById('edit-em-priority').value = em.priority;
    
    window.safeToggle('edit-emergency-modal', false);
};

window.updateEmergencyDetails = async function() {
    const id = document.getElementById('edit-em-id').value;
    const em = window.emergencyData.find(e => e.id === id);
    
    if(em && em.firebaseId) {
        em.name = document.getElementById('edit-em-name').value;
        em.age = document.getElementById('edit-em-age').value;
        em.gender = document.getElementById('edit-em-gender').value;
        em.complaint = document.getElementById('edit-em-complaint').value;
        em.priority = document.getElementById('edit-em-priority').value;

        await updateDoc(doc(db, "emergency", em.firebaseId), {
            name: em.name, 
            age: em.age, 
            gender: em.gender, 
            complaint: em.complaint, 
            priority: em.priority
        });

        window.renderEmergencyList();
        window.showToast('Emergency Record Updated');
        window.safeToggle('edit-emergency-modal', true);
    }
};

window.clearAllEmergency = async function() {
    if (window.emergencyData.length === 0) { window.showToast("List Empty"); return; }
    if (!confirm("Delete ALL emergency records?")) return;
    
    const promises = window.emergencyData.map(p => deleteDoc(doc(db, "emergency", p.firebaseId)));
    await Promise.all(promises);
    window.emergencyData = [];
    window.renderEmergencyList();
    window.showToast("All Cleared");
};

// --- ADMIN ---
window.createNewAdmin = async function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newId = formData.get('newAdminId');
    const newPass = formData.get('newAdminPass');

    if (newId && newPass) {
        if (window.admins.some(a => a.id === newId)) {
            window.showToast('Admin ID already exists');
            return;
        }
        const newAdmin = { id: newId, pass: newPass };
        const docRef = await addDoc(collection(db, "admins"), newAdmin);
        window.admins.push({ ...newAdmin, firebaseId: docRef.id });
        
        window.renderAdminList();
        window.showToast(`New Admin '${newId}' Created!`);
        e.target.reset();
    }
};

window.saveHospitalConfig = function() {
    window.hospitalConfig.name = document.getElementById('conf-hosp-name').value;
    window.hospitalConfig.address = document.getElementById('conf-hosp-addr').value;
    window.showToast("Hospital Settings Saved (Session Only)");
};

// --- DELETION LOGIC (UNIVERSAL) ---
window.openConfirmModal = function(type, id) {
    itemToDelete = { type, id };
    window.safeToggle('confirm-modal', false);
};

window.closeConfirmModal = function() {
    window.safeToggle('confirm-modal', true);
    itemToDelete = null;
};

window.executeDeletion = async function() {
    if (!itemToDelete) return;

    const deleteFromDB = async (arr, collectionName) => {
        const item = arr.find(x => String(x.id) === String(itemToDelete.id));
        if(item && item.firebaseId) {
            await deleteDoc(doc(db, collectionName, item.firebaseId));
            const idx = arr.indexOf(item);
            if(idx > -1) arr.splice(idx, 1);
        }
    };

    if (itemToDelete.type === 'patient') {
        await deleteFromDB(window.patientsData, "patients");
        window.renderExistingPatients();
        window.renderPatientList();
    } else if (itemToDelete.type === 'doctor') {
        await deleteFromDB(window.doctorsData, "doctors");
        window.renderDoctors();
        window.renderAttendance();
        window.updateDoctorDropdown();
    } else if (itemToDelete.type === 'admin') {
        if (itemToDelete.id === 'IJAZ') { window.showToast('Cannot delete Main Admin'); window.closeConfirmModal(); return; }
        await deleteFromDB(window.admins, "admins");
        window.renderAdminList();
        if (itemToDelete.id === window.currentUser) window.executeLogout(); 
    } else if (itemToDelete.type === 'emergency') {
        await deleteFromDB(window.emergencyData, "emergency");
        window.renderEmergencyList();
    } else if (itemToDelete.type === 'bill') {
        await deleteFromDB(window.billsData, "bills");
        window.renderBilling();
    } else if (itemToDelete.type === 'medicine') {
        await deleteFromDB(window.pharmacyData, "pharmacy");
        window.renderPharmacy();
    }
    
    window.updateHomeStats();
    window.closeConfirmModal();
    window.showToast(`${itemToDelete.type} deleted`);
};


// =================================================================
// 7. UI RENDER FUNCTIONS
// =================================================================

window.navigateTo = function(pageId) {
    document.querySelectorAll('.nav-pill').forEach(n => n.classList.remove('active'));
    const activeBtn = document.getElementById(`nav-${pageId}`);
    if(activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${pageId}`);
    if(target) target.classList.add('active');

    if(pageId === 'existing-patient') window.renderExistingPatients();
    if(pageId === 'patient-list') window.renderPatientList();
    if(pageId === 'doctors') window.renderDoctors();
    if(pageId === 'attendance') window.renderAttendance();
    if(pageId === 'profile') window.renderAdminList();
    if(pageId === 'emergency') window.renderEmergencyList();
    if(pageId === 'billing') window.renderBilling();
    if(pageId === 'pharmacy') window.renderPharmacy();
    if(pageId === 'home') window.updateHomeStats();
};

window.safeToggle = function(id, isHiding) {
    const el = document.getElementById(id);
    if (el) isHiding ? el.classList.add('hidden') : el.classList.remove('hidden');
};

window.showToast = function(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    t.classList.remove('translate-y-32', 'opacity-0');
    setTimeout(() => t.classList.add('translate-y-32', 'opacity-0'), 3000);
};

window.updateHomeStats = function() {
    if(document.getElementById('stat-total-today')) document.getElementById('stat-total-today').innerText = window.patientsData.length;
    if(document.getElementById('stat-waiting')) document.getElementById('stat-waiting').innerText = window.patientsData.filter(p => p.status === 'Waiting').length;
    if(document.getElementById('stat-total-doctors')) document.getElementById('stat-total-doctors').innerText = window.doctorsData.length;
    if(document.getElementById('stat-doctors-present')) document.getElementById('stat-doctors-present').innerText = window.doctorsData.filter(d => d.status === 'Present').length;
    
    const revenue = window.billsData.filter(b => b.status === 'Paid').reduce((acc, curr) => acc + curr.amount, 0);
    if(document.getElementById('stat-revenue')) document.getElementById('stat-revenue').innerText = `₹${revenue}`;

    if(document.getElementById('view-home').classList.contains('active')) {
        window.renderCharts(revenue);
    }
};

window.renderCharts = function(revenue) {
    const ctx1 = document.getElementById('chart-patient-status');
    const ctx2 = document.getElementById('chart-finance');
    if(!ctx1 || !ctx2) return;

    const waiting = window.patientsData.filter(p => p.status === 'Waiting').length;
    const consulted = window.patientsData.filter(p => p.status === 'Consulted').length;
    const admitted = window.patientsData.filter(p => p.status === 'Admitted').length;

    if(patientChart) { patientChart.destroy(); patientChart = null; }
    if(financeChart) { financeChart.destroy(); financeChart = null; }

    patientChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: ['Waiting', 'Consulted', 'Admitted'],
            datasets: [{ data: [waiting, consulted, admitted], backgroundColor: ['#F97316', '#10B981', '#3B82F6'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const feeIncome = revenue * 0.6; 
    const medIncome = revenue * 0.4; 

    financeChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: ['Doctor Fees', 'Pharmacy'],
            datasets: [{ label: 'Income (₹)', data: [feeIncome, medIncome], backgroundColor: ['#0F766E', '#F43F5E'], borderRadius: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
};

window.renderEmergencyList = function(filterText = '') {
    const tbody = document.getElementById('emergency-list-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const filtered = window.emergencyData.filter(e => e.name.toLowerCase().includes(filterText.toLowerCase()));

    if (filtered.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500 italic">No records.</td></tr>`; 
        return; 
    }

    filtered.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono text-red-600 font-bold px-4 py-2">E-${e.id}</td>
            <td class="font-bold px-4 py-2">${e.name}</td>
            <td class="text-sm px-4 py-2">${e.age} / ${e.gender}</td>
            <td class="max-w-xs truncate px-4 py-2">${e.complaint}</td>
            <td class="text-center px-4 py-2"><span class="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold">${e.priority}</span></td>
            <td class="text-center px-4 py-2 flex items-center justify-center gap-2">
                <button onclick="window.openEditEmergencyModal('${e.id}')" class="text-blue-400 hover:text-blue-600 px-1">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="window.openConfirmModal('emergency', '${e.id}')" class="text-red-400 hover:text-red-600 px-1">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderExistingPatients = function(filterText = '') {
    const tbody = document.getElementById('existing-patient-table-body');
    tbody.innerHTML = '';
    const filtered = window.patientsData.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()) || p.id.toLowerCase().includes(filterText.toLowerCase()));

    if(filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500 italic">No records found.</td></tr>`; return; }

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition-colors";
        tr.innerHTML = `
            <td class="font-mono text-[#009688] font-bold">#${p.id}</td>
            <td class="font-medium">${p.name}</td>
            <td class="text-sm"><span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs border">${p.ward || 'General'}</span></td>
            <td class="text-gray-600">${p.mobile}</td>
            <td class="text-center flex justify-center gap-2">
                <button onclick="window.openEditPatientDetailsModal('${p.id}')" class="bg-teal-50 hover:bg-[#009688] text-[#009688] hover:text-white px-3 py-1.5 rounded-full text-xs font-bold transition-all"><i class="fas fa-pen"></i></button>
                <button onclick="window.openSummaryModal('${p.id}')" class="bg-indigo-100 hover:bg-indigo-500 text-indigo-600 hover:text-white px-3 py-1.5 rounded-full text-xs font-bold transition-all"><i class="fas fa-file-medical-alt"></i></button>
                <button onclick="window.openConfirmModal('patient', '${p.id}')" class="bg-red-100 hover:bg-red-500 text-red-500 hover:text-white px-3 py-1.5 rounded-full text-xs font-bold transition-all"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderDoctors = function(filterText = '') {
    const tbody = document.getElementById('doctor-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    const filtered = window.doctorsData.filter(d => d.name.toLowerCase().includes(filterText.toLowerCase()));

    if(filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-500 italic">No staff found.</td></tr>`; return; }

    filtered.forEach(d => {
        const isPresent = d.status === 'Present';
        const statusBadge = isPresent 
            ? `<span class="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2 py-1 rounded-md text-xs font-bold"><i class="fas fa-check-circle"></i> Present</span>`
            : `<span class="inline-flex items-center gap-1 text-[#F05D5B] bg-red-100 px-2 py-1 rounded-md text-xs font-bold"><i class="fas fa-times-circle"></i> Absent</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono text-xs text-gray-400">${d.id}</td>
            <td class="font-medium">${d.name} <br><span class="text-xs text-[#009688]">${d.department || 'General'}</span></td>
            <td class="text-sm text-gray-600">${d.qualification || 'N/A'}</td>
            <td class="text-sm text-gray-600">${d.workDays || 'N/A'}</td>
            <td>${statusBadge}</td>
            <td class="font-mono text-sm text-[#009688]">${d.mobile}</td>
            <td class="text-center flex items-center justify-center gap-2">
                <button onclick="window.openEditDoctorModal('${d.id}')" class="text-blue-400 hover:text-blue-600"><i class="fas fa-edit"></i></button>
                <button onclick="window.openConfirmModal('doctor', '${d.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderAttendance = function() {
    const tbody = document.getElementById('attendance-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    window.doctorsData.forEach((d, index) => {
        const isPresent = d.status === 'Present';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-medium text-lg text-slate-700 pl-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md ${isPresent ? 'bg-emerald-500' : 'bg-slate-400'}">
                        ${d.name.charAt(0)}
                    </div>
                    ${d.name}
                </div>
            </td>
            <td class="text-center">
                <span class="status-animate text-xs font-extrabold px-3 py-1 rounded-lg ${isPresent ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'}">
                    ${d.status.toUpperCase()}
                </span>
            </td>
            <td class="text-center">
                <div class="flex justify-center items-center gap-2 bg-slate-100 p-1.5 rounded-full w-fit mx-auto border border-slate-200">
                    <button onclick="window.toggleAttendance(${index}, 'Present')" class="status-btn present ${isPresent ? 'active' : 'inactive'}"><i class="fas fa-check"></i> Present</button>
                    <button onclick="window.toggleAttendance(${index}, 'Absent')" class="status-btn absent ${!isPresent ? 'active' : 'inactive'}"><i class="fas fa-times"></i> Absent</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderBilling = function() {
    const tbody = document.getElementById('billing-table-body');
    tbody.innerHTML = '';
    if (window.billsData.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500 italic">No invoices found.</td></tr>`; return; }

    window.billsData.forEach(b => {
        const isPaid = b.status === 'Paid';
        const statusBadge = isPaid 
            ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">PAID (${b.method || 'Cash'})</span>`
            : `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">PENDING</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono text-sm font-bold text-[#009688]">${b.id}</td>
            <td class="font-medium">${b.patientName}</td>
            <td class="text-sm text-gray-600">${b.date}</td>
            <td class="text-sm text-gray-600 max-w-xs truncate" title="${b.description}">${b.description}</td>
            <td class="font-bold">₹${b.amount}</td>
            <td>${statusBadge}</td>
            <td class="text-center flex items-center justify-center gap-2">
                ${!isPaid ? `<button onclick="window.payBill('${b.id}')" class="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold hover:bg-green-600">Pay</button>` : '<span class="text-green-500"><i class="fas fa-check-circle"></i></span>'}
                <button onclick="window.requestAuth(() => window.openEditBillModal('${b.id}'))" class="text-blue-400 hover:text-blue-600"><i class="fas fa-edit"></i></button>
                <button onclick="window.openConfirmModal('bill', '${b.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderPharmacy = function() {
    const tbody = document.getElementById('pharmacy-table-body');
    tbody.innerHTML = '';
    if (window.pharmacyData.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-500 italic">Inventory is empty.</td></tr>`; return; }

    window.pharmacyData.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono text-xs text-gray-400">${m.id}</td>
            <td class="font-bold text-[#009688]">${m.name}<div class="text-xs font-normal text-gray-400">${m.manufacturer}</div></td>
            <td class="text-sm text-gray-600">${m.category} (${m.dosage})</td>
            <td class="font-bold">₹${m.price}</td>
            <td class="text-sm font-bold ${m.stock < 10 ? 'text-red-600' : 'text-green-600'}">${m.stock}</td>
            <td class="text-sm text-gray-500">${m.expiry}</td>
            <td class="text-center flex justify-center gap-2">
                <button onclick="window.openEditMedicineModal('${m.id}')" class="text-blue-400 hover:text-blue-600"><i class="fas fa-edit"></i></button>
                <button onclick="window.openConfirmModal('medicine', '${m.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderPatientList = function(filterText = '') {
    const tbody = document.getElementById('patient-list-table-body');
    tbody.innerHTML = '';
    const filtered = window.patientsData.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()));

    if(filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500 italic">Queue is empty.</td></tr>`; return; }

    filtered.forEach(p => {
        const isWaiting = p.status === 'Waiting';
        const selectClass = isWaiting ? 'bg-red-50 text-[#F05D5B] border-red-200' : 'bg-green-100 text-green-700 border-green-200';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center"><span class="bg-[#009688] text-white font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto shadow-sm text-sm">${p.token}</span></td>
            <td class="font-medium">${p.name}</td>
            <td><span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">${p.doctor || 'Unassigned'}</span></td>
            <td class="text-center">
                <div class="relative inline-block w-40">
                    <select onchange="window.updatePatientStatus('${p.id}', this.value)" class="w-full appearance-none py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold border-2 cursor-pointer focus:outline-none ${selectClass}">
                        <option value="Waiting" ${p.status === 'Waiting' ? 'selected' : ''}>Waiting Area</option>
                        <option value="Consulted" ${p.status === 'Consulted' ? 'selected' : ''}>Consulted</option>
                    </select>
                    <i class="fas fa-caret-down absolute right-3 top-2 pointer-events-none ${isWaiting ? 'text-[#F05D5B]' : 'text-green-700'}"></i>
                </div>
            </td>
            <td class="text-center"><button onclick="window.openConfirmModal('patient', '${p.id}')" class="text-red-400 hover:text-red-600 px-2"><i class="fas fa-trash-alt"></i> Delete</button></td>
        `;
        tbody.appendChild(tr);
    });
};

window.renderAdminList = function() {
    const tbody = document.getElementById('admin-list-body');
    tbody.innerHTML = '';
    window.admins.forEach((admin, index) => {
        const isActive = admin.id === window.currentUser;
        const isMainAdmin = admin.id === 'IJAZ';
        const actionBtn = !isMainAdmin ? `<button onclick="window.openConfirmModal('admin', '${admin.id}')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash-alt"></i> Remove</button>` : `<span class="text-xs text-gray-400 italic">Protected</span>`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono text-gray-500">${index + 1}</td>
            <td class="font-bold text-[#009688]">${admin.id} ${isActive ? '<span class="ml-2 text-xs bg-green-100 text-green-700 px-1 rounded">You</span>' : ''}</td>
            <td><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span></td>
            <td>${isMainAdmin ? '<span class="text-xs text-gray-400 font-medium">Super Admin</span>' : '<span class="text-xs text-gray-500">Admin</span>'}</td>
            <td class="text-center">${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
};

// =================================================================
// 8. HELPER MODALS & UTILS
// =================================================================

window.openEditPatientDetailsModal = function(id) {
    const p = window.patientsData.find(x => x.id === id);
    if(!p) return;
    currentEditingId = id;
    document.getElementById('edit-detail-name').value = p.name;
    document.getElementById('edit-detail-mobile').value = p.mobile;
    document.getElementById('edit-detail-address').value = p.address || '';
    document.getElementById('edit-detail-prescriptions').value = p.prescriptions || '';
    document.getElementById('symptoms-history').innerText = p.symptoms || 'No history recorded.';
    document.getElementById('new-symptom-entry').value = '';
    window.safeToggle('edit-patient-modal', false);
};

window.openEditDoctorModal = function(id) {
    const doc = window.doctorsData.find(d => d.id === id);
    if (!doc) return;
    document.getElementById('edit-doc-id').value = doc.id;
    document.getElementById('edit-doc-name').value = doc.name;
    document.getElementById('edit-doc-dept').value = doc.department;
    document.getElementById('edit-doc-qual').value = doc.qualification;
    document.getElementById('edit-doc-days').value = doc.workDays;
    document.getElementById('edit-doc-time').value = doc.workTime;
    document.getElementById('edit-doc-mobile').value = doc.mobile;
    document.getElementById('edit-doc-status').value = doc.status;
    window.safeToggle('edit-doctor-modal', false);
};

window.openEditMedicineModal = function(id) {
    const med = window.pharmacyData.find(m => m.id === id);
    if(!med) return;
    document.getElementById('edit-med-id').value = med.id;
    document.getElementById('edit-med-name').value = med.name;
    document.getElementById('edit-med-category').value = med.category;
    document.getElementById('edit-med-price').value = med.price;
    document.getElementById('edit-med-manuf').value = med.manufacturer;
    document.getElementById('edit-med-batch').value = med.batch;
    document.getElementById('edit-med-dose').value = med.dosage;
    document.getElementById('edit-med-stock').value = med.stock;
    document.getElementById('edit-med-expiry').value = med.expiry;
    window.safeToggle('edit-medicine-modal', false);
};

window.openSummaryModal = function(id) {
    const p = window.patientsData.find(x => x.id === id);
    if (!p) return;
    const today = new Date().toLocaleDateString();
    const summaryHTML = `
        <div class="space-y-6">
            <div class="border-b border-slate-300 pb-4 flex justify-between items-start">
                <div><h2 class="text-2xl font-bold text-slate-800 uppercase">${window.hospitalConfig.name}</h2><p class="text-slate-500 text-sm">${window.hospitalConfig.address}</p></div>
                <div class="text-right"><h3 class="text-xl font-bold text-teal-700">DISCHARGE SUMMARY</h3><p class="text-sm font-mono text-slate-500">Date: ${today}</p></div>
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div><p><span class="font-bold text-slate-600">Patient Name:</span> ${p.name}</p><p><span class="font-bold text-slate-600">ID:</span> ${p.id}</p><p><span class="font-bold text-slate-600">Contact:</span> ${p.mobile}</p></div>
                <div class="text-right"><p><span class="font-bold text-slate-600">Doctor:</span> ${p.doctor || 'Unassigned'}</p><p><span class="font-bold text-slate-600">Ward:</span> ${p.ward || 'General'}</p></div>
            </div>
            <div class="bg-white p-4 rounded-lg border border-slate-200"><h4 class="font-bold text-slate-700 mb-2 border-b border-slate-100 pb-1">Clinical Notes</h4><p class="whitespace-pre-wrap text-slate-600">${p.symptoms || 'No notes.'}</p></div>
            <div class="bg-white p-4 rounded-lg border border-slate-200"><h4 class="font-bold text-slate-700 mb-2 border-b border-slate-100 pb-1">Prescriptions</h4><p class="whitespace-pre-wrap text-slate-600">${p.prescriptions || 'No medications.'}</p></div>
        </div>`;
    document.getElementById('summary-content').innerHTML = summaryHTML;
    window.safeToggle('summary-modal', false);
};

window.copySummary = function() {
    const text = document.getElementById('summary-content').innerText;
    navigator.clipboard.writeText(text);
    window.showToast("Summary copied to clipboard");
};

// Calculations
window.calculateAge = function() {
    const val = document.getElementById('input-dob').value;
    if(!val) return;
    const diff = Date.now() - new Date(val).getTime();
    const age = new Date(diff).getUTCFullYear() - 1970;
    document.getElementById('input-age').value = Math.abs(age);
};

window.calculateDobFromAge = function() {
    const age = document.getElementById('input-age').value;
    if(!age) return;
    const currentYear = new Date().getFullYear();
    document.getElementById('input-dob').value = `${currentYear - age}-01-01`;
};

window.calculateBMI = function() {
    const h = document.querySelector('input[name="height"]').value / 100;
    const w = document.querySelector('input[name="weight"]').value;
    if(h && w) document.querySelector('input[name="bmi"]').value = (w / (h*h)).toFixed(1);
};

window.clearForm = function() { document.getElementById('new-patient-form').reset(); };
window.filterPatients = function(val, type) { 
    if(type==='existing') window.renderExistingPatients(val);
    if(type==='list') window.renderPatientList(val);
    if(type==='emergency') window.renderEmergencyList(val);
};

window.updateDoctorDropdown = function() {
    const s = document.getElementById('doctor-select');
    if(s) {
        s.innerHTML = '<option value="">Select Doctor</option>';
        window.doctorsData.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.name;
            opt.innerText = `${d.name} (${d.department})`;
            s.appendChild(opt);
        });
    }
};

// --- MANUAL BILLING UTILS ---
window.openManualBillModal = function() {
    currentBillMeds = [];
    document.getElementById('bill-doc-fee').value = '';
    document.getElementById('bill-display-total').innerText = '₹0';
    window.updateBillMedList();

    const select = document.getElementById('bill-patient-select');
    select.innerHTML = '<option value="">Choose Patient...</option>';
    window.patientsData.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = `${p.name} (ID: ${p.id})`;
        opt.setAttribute('data-name', p.name);
        select.appendChild(opt);
    });

    const medSelect = document.getElementById('bill-med-select');
    medSelect.innerHTML = '<option value="">Select Medicine...</option>';
    window.pharmacyData.forEach(m => {
        if(m.stock > 0) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.innerText = `${m.name} (₹${m.price})`;
            opt.setAttribute('data-price', m.price);
            opt.setAttribute('data-name', m.name);
            medSelect.appendChild(opt);
        }
    });
    window.safeToggle('add-bill-modal', false);
};

window.autoFillFees = function() {
    const pid = document.getElementById('bill-patient-select').value;
    if (!pid) return;
    const pat = window.patientsData.find(p => p.id === pid);
    if (pat) {
        let fee = 500;
        const doc = window.doctorsData.find(d => d.name === pat.doctor);
        if (doc) {
            const deptFees = { 'Cardiology': 1200, 'Neurology': 1500, 'Orthopedics': 1000, 'Pediatrics': 800, 'Dental': 600, 'General': 500 };
            fee = deptFees[doc.department] || 500;
        }
        document.getElementById('bill-doc-fee').value = fee;
        window.calculateTotalBill();
    }
};

window.addMedicineToBill = function() {
    const medSelect = document.getElementById('bill-med-select');
    const qtyInput = document.getElementById('bill-med-qty');
    const medId = medSelect.value;
    const qty = parseInt(qtyInput.value);
    if(!medId || qty < 1) return;
    const price = parseFloat(medSelect.options[medSelect.selectedIndex].getAttribute('data-price'));
    const name = medSelect.options[medSelect.selectedIndex].getAttribute('data-name');
    currentBillMeds.push({ id: medId, name: name, price: price, qty: qty, total: price * qty });
    window.updateBillMedList();
    window.calculateTotalBill();
};

window.updateBillMedList = function() {
    const list = document.getElementById('bill-med-list');
    list.innerHTML = '';
    currentBillMeds.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-slate-100 p-2 rounded-lg';
        li.innerHTML = `<span>${item.name} x${item.qty}</span> <span class="font-bold">₹${item.total}</span>`;
        list.appendChild(li);
    });
};

window.calculateTotalBill = function() {
    const docFee = parseFloat(document.getElementById('bill-doc-fee').value) || 0;
    const medTotal = currentBillMeds.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('bill-display-total').innerText = `₹${docFee + medTotal}`;
    document.getElementById('bill-amount-hidden').value = docFee + medTotal;
};

window.payBill = function(id) {
    pendingBillId = id;
    const bill = window.billsData.find(b => b.id === id);
    if(bill) {
        document.getElementById('pay-inv-id').innerText = bill.id;
        document.getElementById('pay-amount-display').innerText = `₹${bill.amount}`;
        window.safeToggle('payment-modal', false);
    }
};

window.openEditBillModal = function(id) {
    const bill = window.billsData.find(b => b.id === id);
    if(!bill) return;
    document.getElementById('edit-bill-id').value = bill.id;
    document.getElementById('edit-bill-display-id').value = bill.id;
    document.getElementById('edit-bill-patient').value = bill.patientName;
    document.getElementById('edit-bill-desc').value = bill.description;
    document.getElementById('edit-bill-status').value = bill.status;
    editingBillMeds = bill.medicines ? [...bill.medicines] : [];
    const medTotal = editingBillMeds.reduce((acc, curr) => acc + curr.total, 0);
    const baseFee = bill.amount - medTotal;
    document.getElementById('edit-bill-doc-fee').value = baseFee > 0 ? baseFee : 0;
    
    const medSelect = document.getElementById('edit-bill-med-select');
    medSelect.innerHTML = '<option value="">Select Medicine...</option>';
    window.pharmacyData.forEach(m => {
        if(m.stock > 0) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.innerText = `${m.name} (₹${m.price})`;
            opt.setAttribute('data-price', m.price);
            opt.setAttribute('data-name', m.name);
            medSelect.appendChild(opt);
        }
    });
    window.updateEditBillMedList();
    window.calculateEditBillTotal();
    window.safeToggle('edit-bill-modal', false);
};

window.addMedicineToEditBill = function() {
    const medSelect = document.getElementById('edit-bill-med-select');
    const qtyInput = document.getElementById('edit-bill-med-qty');
    const medId = medSelect.value;
    const qty = parseInt(qtyInput.value);
    if(!medId || qty < 1) return;
    const price = parseFloat(medSelect.options[medSelect.selectedIndex].getAttribute('data-price'));
    const name = medSelect.options[medSelect.selectedIndex].getAttribute('data-name');
    editingBillMeds.push({ id: medId, name: name, price: price, qty: qty, total: price * qty });
    window.updateEditBillMedList();
    window.calculateEditBillTotal();
};

window.updateEditBillMedList = function() {
    const list = document.getElementById('edit-bill-med-list');
    list.innerHTML = '';
    editingBillMeds.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-slate-100 p-2 rounded-lg';
        li.innerHTML = `<span>${item.name} x${item.qty}</span> <div class="flex items-center gap-2"><span class="font-bold">₹${item.total}</span><button type="button" onclick="window.removeMedicineFromEditBill(${index})" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-times"></i></button></div>`;
        list.appendChild(li);
    });
};

window.removeMedicineFromEditBill = function(index) {
    editingBillMeds.splice(index, 1);
    window.updateEditBillMedList();
    window.calculateEditBillTotal();
};

window.calculateEditBillTotal = function() {
    const docFee = parseFloat(document.getElementById('edit-bill-doc-fee').value) || 0;
    const medTotal = editingBillMeds.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('edit-bill-amount').value = docFee + medTotal;
};

// --- BACKUP DOWNLOAD (JSON) ---
window.downloadBackup = function() {
    const data = {
        admins: window.admins, doctors: window.doctorsData, patients: window.patientsData, 
        emergency: window.emergencyData, bills: window.billsData, pharmacy: window.pharmacyData, 
        config: window.hospitalConfig
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "medos_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    window.showToast("Backup Downloaded");
};