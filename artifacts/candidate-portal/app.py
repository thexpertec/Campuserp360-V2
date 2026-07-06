import streamlit as st
import pandas as pd
import base64
import os
import requests
from datetime import datetime
from io import BytesIO

# ─── Locale helpers ───────────────────────────────────────────────────────────
@st.cache_data(ttl=300)
def _fetch_locale() -> dict:
    try:
        r = requests.get("http://localhost:8080/api/tenants/locale", timeout=3)
        if r.ok:
            return r.json()
    except Exception:
        pass
    return {"currency": "PKR", "dateFormat": "DD/MM/YYYY", "timezone": "Asia/Karachi"}

def _locale_currency() -> str:
    return _fetch_locale().get("currency", "PKR")

_CURRENCY_SYMBOLS = {"PKR": "Rs", "USD": "$", "GBP": "£", "AED": "AED", "SAR": "SAR"}

def fmt_currency(amount) -> str:
    sym = _CURRENCY_SYMBOLS.get(_locale_currency(), _locale_currency())
    return f"{sym} {int(amount):,}"

def fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00")) if "T" in iso else datetime.strptime(iso, "%Y-%m-%d")
        fmt = _fetch_locale().get("dateFormat", "DD/MM/YYYY")
        if fmt == "MM/DD/YYYY":
            return d.strftime("%m/%d/%Y")
        elif fmt == "YYYY-MM-DD":
            return d.strftime("%Y-%m-%d")
        elif fmt == "DD-MMM-YYYY":
            return d.strftime("%d-%b-%Y")
        else:
            return d.strftime("%d/%m/%Y")
    except Exception:
        return str(iso)

st.set_page_config(
    page_title="CCM Candidate Portal",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* Status badges */
.badge-selected   { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7;
                    padding:3px 12px; border-radius:999px; font-weight:700; font-size:13px; }
.badge-wait       { background:#fef3c7; color:#92400e; border:1px solid #fcd34d;
                    padding:3px 12px; border-radius:999px; font-weight:700; font-size:13px; }
.badge-not        { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;
                    padding:3px 12px; border-radius:999px; font-weight:700; font-size:13px; }
.badge-pending    { background:#e0e7ff; color:#3730a3; border:1px solid #a5b4fc;
                    padding:3px 12px; border-radius:999px; font-weight:700; font-size:13px; }
.badge-paid       { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7;
                    padding:3px 12px; border-radius:999px; font-weight:700; font-size:13px; }

/* Timeline */
.stage-done    { border-left:4px solid #03CC0B; padding:8px 16px; margin:4px 0; background:#f0fdf4; border-radius:0 8px 8px 0; }
.stage-active  { border-left:4px solid #064A1A; padding:8px 16px; margin:4px 0; background:#ecfdf5; border-radius:0 8px 8px 0; font-weight:700; }
.stage-pending { border-left:4px solid #d1d5db; padding:8px 16px; margin:4px 0; background:#f9fafb; border-radius:0 8px 8px 0; color:#9ca3af; }

/* Card */
.info-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px 20px; margin-bottom:12px; }
.info-card h4 { margin:0 0 4px 0; color:#064A1A; font-size:15px; }
.info-card p  { margin:0; color:#6b7280; font-size:13px; }

/* Admit card printable */
.admit-card { border:2px solid #064A1A; padding:24px; border-radius:8px;
              font-family:Georgia,serif; background:#fff; }
.admit-card h2 { color:#064A1A; text-align:center; margin-bottom:4px; }
.admit-card .roll { font-size:28px; font-weight:900; color:#03CC0B;
                    text-align:center; letter-spacing:4px; padding:12px;
                    background:#f0fdf4; border:2px dashed #03CC0B; border-radius:8px; margin:12px 0; }

/* Offer letter */
.offer-letter { border:1px solid #e5e7eb; padding:40px; border-radius:8px;
                background:#fff; font-family:Georgia,serif; line-height:1.8; }
.offer-letter h3 { color:#064A1A; }

/* Challan */
.challan { border:2px solid #333; padding:0; border-radius:4px; background:#fff;
           font-family:'Courier New',monospace; overflow:hidden; }
.challan-header { background:#064A1A; color:#fff; padding:12px 20px; text-align:center; }
.challan-body   { padding:16px 20px; }
.challan-row    { display:flex; justify-content:space-between; padding:4px 0;
                  border-bottom:1px dotted #ccc; }
.challan-amount { font-size:22px; font-weight:900; color:#064A1A; text-align:center;
                  padding:10px; background:#f0fdf4; border:1px solid #064A1A;
                  border-radius:4px; margin:8px 0; }

/* Login */
.login-header { text-align:center; padding:24px 0 16px; }
.login-header h1 { color:#064A1A; font-size:2rem; margin:0; }
.login-header p  { color:#6b7280; margin:4px 0 0; }
.demo-box { background:#f0fdf4; border:1px solid #6ee7b7; border-radius:10px;
            padding:14px 18px; margin:12px 0; }
.demo-box h5 { color:#065f46; margin:0 0 6px; }
.demo-box code { background:#d1fae5; padding:2px 8px; border-radius:4px; font-size:13px; }

/* Welcome banner */
.welcome-banner { background:linear-gradient(135deg,#064A1A,#0a5c20);
                  color:#fff; padding:20px 28px; border-radius:12px; margin-bottom:20px; }
.welcome-banner h2 { margin:0 0 4px; font-size:1.5rem; }
.welcome-banner p  { margin:0; opacity:.85; font-size:14px; }
</style>
""", unsafe_allow_html=True)

# ─── Mock Data ────────────────────────────────────────────────────────────────
DEMO_ACCOUNTS = {
    "hamza@example.com": {
        "ref_id": "CCM-2026-HMZ001",
        "name": "Muhammad Hamza Iqbal",
        "first_name": "Muhammad Hamza",
        "last_name": "Iqbal",
        "email": "hamza@example.com",
        "phone": "0300-1234567",
        "password": "12345",
        "father_name": "Iqbal Ahmed",
        "guardian_mobile": "0300-1234567",
        "date_of_birth": "2012-03-15",
        "blood_group": "B+",
        "class_applying": "Class VI",
        "session": "2026-27",
        "address": "House 45, Street 7, G-10/2, Islamabad",
        "city": "Islamabad",
        "state": "Islamabad Capital Territory",
        "exam_center": "Islamabad",
        "status": "result_announced",
        "roll_no": "CCM-VI-001",
        "test_date": "2026-05-12",
        "test_time": "08:00 AM",
        "test_venue": "Government College, Islamabad",
        "marks": 190,
        "total_marks": 200,
        "merit": 1,
        "result_status": "selected",
        "subjects": {
            "English":    {"obtained": 47, "total": 50},
            "Mathematics":{"obtained": 48, "total": 50},
            "Urdu":       {"obtained": 28, "total": 30},
            "Science":    {"obtained": 29, "total": 30},
            "IQ / Verbal":{"obtained": 38, "total": 40},
        },
        "fee": {"challan_no":"CCM-2026-CH-001","amount":2000,
                "bank":"National Bank of Pakistan","account":"0004-6000-2000-3201",
                "due_date":"2026-04-30","status":"paid","method":"bank_deposit"},
        "docs": {
            "Birth Certificate":    {"uploaded":True,  "verified":True},
            "B-Form (Child CNIC)":  {"uploaded":True,  "verified":True},
            "School Leaving Cert":  {"uploaded":True,  "verified":False},
            "Student Photo":        {"uploaded":True,  "verified":True},
            "Medical Fitness Cert": {"uploaded":False, "verified":False},
        },
        "joining_date": "2026-06-15",
        "fee_deadline": "2026-06-10",
        "offer_date": "2026-05-28",
    },
    "ali@example.com": {
        "ref_id": "CCM-2026-ALI002",
        "name": "Ali Abdullah Khan",
        "first_name": "Ali Abdullah",
        "last_name": "Khan",
        "email": "ali@example.com",
        "phone": "0300-9876543",
        "password": "12345",
        "father_name": "Tariq Mehmood Khan",
        "guardian_mobile": "0301-9876543",
        "date_of_birth": "2012-07-22",
        "blood_group": "A+",
        "class_applying": "Class VI",
        "session": "2026-27",
        "address": "Flat 12, Block C, DHA Phase 2, Lahore",
        "city": "Lahore",
        "state": "Punjab",
        "exam_center": "Lahore",
        "status": "test_scheduled",
        "roll_no": "CCM-VI-002",
        "test_date": "2026-05-12",
        "test_time": "08:00 AM",
        "test_venue": "Government College, Lahore",
        "marks": None,
        "total_marks": 200,
        "merit": None,
        "result_status": None,
        "subjects": None,
        "fee": {"challan_no":"CCM-2026-CH-002","amount":2000,
                "bank":"National Bank of Pakistan","account":"0004-6000-2000-3201",
                "due_date":"2026-04-30","status":"bank_pending","method":"bank_deposit"},
        "docs": {
            "Birth Certificate":    {"uploaded":True,  "verified":True},
            "B-Form (Child CNIC)":  {"uploaded":False, "verified":False},
            "School Leaving Cert":  {"uploaded":False, "verified":False},
            "Student Photo":        {"uploaded":True,  "verified":True},
            "Medical Fitness Cert": {"uploaded":False, "verified":False},
        },
        "joining_date": None,
        "fee_deadline": None,
        "offer_date": None,
    },
    "fawad@example.com": {
        "ref_id": "CCM-2026-FAW015",
        "name": "Fawad Saleem Kashmiri",
        "first_name": "Fawad",
        "last_name": "Kashmiri",
        "email": "fawad@example.com",
        "phone": "0312-1112233",
        "password": "12345",
        "father_name": "Saleem Kashmiri",
        "guardian_mobile": "0313-1112233",
        "date_of_birth": "2011-11-05",
        "blood_group": "O-",
        "class_applying": "Class IX",
        "session": "2026-27",
        "address": "Chak 22, Rahim Yar Khan",
        "city": "Rahim Yar Khan",
        "state": "Punjab",
        "exam_center": "Multan",
        "status": "result_announced",
        "roll_no": "CCM-IX-015",
        "test_date": "2026-05-12",
        "test_time": "08:00 AM",
        "test_venue": "Bahauddin Zakariya University, Multan",
        "marks": 92,
        "total_marks": 200,
        "merit": 15,
        "result_status": "not_selected",
        "subjects": {
            "English":    {"obtained": 22, "total": 50},
            "Mathematics":{"obtained": 24, "total": 50},
            "Urdu":       {"obtained": 13, "total": 30},
            "Science":    {"obtained": 13, "total": 30},
            "IQ / Verbal":{"obtained": 20, "total": 40},
        },
        "fee": {"challan_no":"CCM-2026-CH-015","amount":2000,
                "bank":"National Bank of Pakistan","account":"0004-6000-2000-3201",
                "due_date":"2026-04-30","status":"paid","method":"jazzcash"},
        "docs": {
            "Birth Certificate":    {"uploaded":True, "verified":True},
            "B-Form (Child CNIC)":  {"uploaded":True, "verified":True},
            "School Leaving Cert":  {"uploaded":True, "verified":True},
            "Student Photo":        {"uploaded":True, "verified":True},
            "Medical Fitness Cert": {"uploaded":True, "verified":True},
        },
        "joining_date": None,
        "fee_deadline": None,
        "offer_date": None,
    },
}

# Phone aliases
PHONE_INDEX = {v["phone"]: k for k, v in DEMO_ACCOUNTS.items()}

STAGES = [
    {"key":"received",         "icon":"📋","title":"Application Received",    "desc":"Submitted via the online portal. Under review."},
    {"key":"verified",         "icon":"✅","title":"Documents Verified",       "desc":"Documents reviewed by the admissions team."},
    {"key":"test_scheduled",   "icon":"📅","title":"Entry Test Scheduled",     "desc":"Roll number, date and centre confirmed."},
    {"key":"test_taken",       "icon":"📝","title":"Entry Test Conducted",     "desc":"Test paper attempted at the exam centre."},
    {"key":"result_announced", "icon":"🏆","title":"Result Announced",         "desc":"Marks and merit position published."},
    {"key":"decision",         "icon":"🎓","title":"Final Decision",           "desc":"Admission outcome."},
]

STATUS_IDX = {
    "received":0,"verified":1,"test_scheduled":2,
    "test_taken":3,"result_announced":4,
    "admitted":5,"rejected":5,"on_hold":5,
}

# ─── Auth ─────────────────────────────────────────────────────────────────────
def authenticate(username: str, password: str):
    u = username.strip().lower()
    key = PHONE_INDEX.get(u) or u
    account = DEMO_ACCOUNTS.get(key)
    if account and account.get("password") == password:
        return account
    return None

# ─── Session init ─────────────────────────────────────────────────────────────
for k, v in [("authenticated", False), ("user", None), ("page", "🏠 Dashboard"), ("login_error", ""), ("uploaded_docs", {})]:
    if k not in st.session_state:
        st.session_state[k] = v

# ─── HTML helpers ─────────────────────────────────────────────────────────────
def download_html(html: str, filename: str, label: str):
    b64 = base64.b64encode(html.encode()).decode()
    href = f'<a href="data:text/html;base64,{b64}" download="{filename}" style="display:inline-block;background:#064A1A;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">⬇️ {label}</a>'
    st.markdown(href, unsafe_allow_html=True)

def challan_html(user):
    f = user["fee"]
    return f"""<!DOCTYPE html><html><head><title>Fee Challan</title>
<style>body{{font-family:'Courier New',monospace;max-width:600px;margin:40px auto;}}
.h{{background:#064A1A;color:#fff;padding:12px 20px;text-align:center;}}
.h h2{{margin:0;font-size:20px;}} .h p{{margin:4px 0 0;font-size:12px;opacity:.85;}}
table{{width:100%;border-collapse:collapse;margin:12px 0;}}
td{{padding:6px 10px;border-bottom:1px dotted #ccc;font-size:13px;}}
td:last-child{{text-align:right;font-weight:600;}}
.amt{{font-size:22px;font-weight:900;color:#064A1A;text-align:center;
      padding:10px;background:#f0fdf4;border:1px solid #064A1A;border-radius:4px;margin:8px 0;}}
.note{{background:#fffbeb;border:1px solid #fcd34d;padding:10px;border-radius:4px;font-size:12px;margin-top:10px;}}
@media print{{body{{margin:0;}} button{{display:none;}}}}
</style></head><body>
<div class="h"><h2>🏛️ Cadet College Murree</h2>
<p>Fee Challan — Entry Test Application 2026-27</p></div>
<table>
<tr><td>Challan No.</td><td>{f['challan_no']}</td></tr>
<tr><td>Applicant Name</td><td>{user['name']}</td></tr>
<tr><td>Father's Name</td><td>{user['father_name']}</td></tr>
<tr><td>Class Applying</td><td>{user['class_applying']}</td></tr>
<tr><td>Applicant ID</td><td>{user['ref_id']}</td></tr>
<tr><td>Bank Name</td><td>{f['bank']}</td></tr>
<tr><td>Account No.</td><td>{f['account']}</td></tr>
<tr><td>Due Date</td><td>{fmt_date(f['due_date'])}</td></tr>
</table>
<div class="amt">{fmt_currency(f['amount'])} /- (Two Thousand Only)</div>
<div class="note">⚠️ Please keep this challan safe. Submit the original to the college along with your documents. Quote your Applicant ID on the back of the deposit slip.</div>
<br><button onclick="window.print()" style="background:#064A1A;color:#fff;padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Print Challan</button>
</body></html>"""

def _letterhead_b64():
    img_path = os.path.join(os.path.dirname(__file__), "letterhead.png")
    with open(img_path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def admit_card_html(user):
    lh = _letterhead_b64()
    return f"""<!DOCTYPE html><html><head><title>Admit Card</title>
<style>
body{{font-family:Georgia,serif;max-width:680px;margin:40px auto;}}
.card{{border:2px solid #064A1A;border-radius:8px;overflow:hidden;}}
.letterhead{{width:100%;display:block;}}
.body{{padding:20px 28px;}}
.roll{{font-size:30px;font-weight:900;color:#03CC0B;text-align:center;
       padding:12px;background:#f0fdf4;border:2px dashed #03CC0B;border-radius:6px;margin:12px 0;letter-spacing:4px;}}
table{{width:100%;border-collapse:collapse;margin:16px 0;}}
td{{padding:8px 12px;border:1px solid #e5e7eb;font-size:14px;}}
td:first-child{{background:#f9fafb;font-weight:600;width:40%;}}
.instr{{background:#fffbeb;border:1px solid #fcd34d;padding:12px 16px;border-radius:6px;margin-top:16px;font-size:12px;}}
.instr h4{{margin:0 0 6px;color:#92400e;}} .instr li{{margin:4px 0;}}
.footer-img{{width:100%;display:block;transform:rotate(180deg);}}
@media print{{body{{margin:0;}} button{{display:none;}}}}
</style></head><body>
<div class="card">
<img src="data:image/png;base64,{lh}" class="letterhead" alt="Letterhead">
<div class="body">
<div class="roll">{user['roll_no']}</div>
<table>
<tr><td>Candidate Name</td><td>{user['name']}</td></tr>
<tr><td>Father's Name</td><td>{user['father_name']}</td></tr>
<tr><td>Class Applying</td><td>{user['class_applying']}</td></tr>
<tr><td>Date of Birth</td><td>{fmt_date(user['date_of_birth'])}</td></tr>
<tr><td>Test Date</td><td><strong>{fmt_date(user['test_date'])}</strong></td></tr>
<tr><td>Reporting Time</td><td><strong>{user['test_time']}</strong> (30 min before test)</td></tr>
<tr><td>Test Centre</td><td>{user['test_venue']}</td></tr>
<tr><td>Exam Centre City</td><td>{user['exam_center']}</td></tr>
</table>
<div class="instr">
<h4>📋 Instructions for Candidates</h4>
<ol>
<li>Bring this admit card and original B-Form / CNIC.</li>
<li>Report at the centre 30 minutes before the test.</li>
<li>Use black or blue ballpoint pen only.</li>
<li>Electronic devices (mobile phones) are strictly prohibited.</li>
<li>Any candidate found cheating will be immediately disqualified.</li>
<li>This card is valid only for the test date mentioned above.</li>
</ol>
</div>
<br>
<button onclick="window.print()" style="background:#064A1A;color:#fff;padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Print Admit Card</button>
</div>
<img src="data:image/png;base64,{lh}" class="footer-img" alt="Footer">
</div></body></html>"""

def offer_letter_html(user):
    lh = _letterhead_b64()
    return f"""<!DOCTYPE html><html><head><title>Offer Letter</title>
<style>
body{{font-family:Georgia,serif;max-width:680px;margin:40px auto;line-height:1.8;font-size:14px;}}
.letterhead{{width:100%;display:block;}}
.body{{padding:20px 40px;}}
.ref{{text-align:right;color:#6b7280;font-size:13px;}}
.date{{margin-bottom:24px;}} .subject{{font-weight:700;text-decoration:underline;}}
.highlight{{background:#f0fdf4;border-left:4px solid #064A1A;padding:10px 16px;margin:16px 0;}}
.sig{{margin-top:40px;}} .line{{border-top:1px solid #333;width:200px;margin-top:60px;}}
.footer-img{{width:100%;display:block;transform:rotate(180deg);}}
@media print{{body{{margin:0;}} button{{display:none;}}}}
</style></head><body>
<img src="data:image/png;base64,{lh}" class="letterhead" alt="Letterhead">
<div class="body">
<p class="ref"><strong>Ref:</strong> CCM/ADM/{user['ref_id']}/2026</p>
<p class="date"><strong>Date:</strong> {fmt_date(user.get('offer_date','2026-05-28'))}</p>
<p><strong>To,</strong><br>
{user['father_name']}<br>
Parent / Guardian of <strong>{user['name']}</strong><br>
{user['address']}</p>
<p class="subject">Subject: Provisional Offer of Admission — Session 2026-27</p>
<p>Dear Sir,</p>
<p>On behalf of the Principal, Cadet College Murree, I am pleased to inform you that <strong>{user['name']}</strong> (Roll No. {user['roll_no']}) has been provisionally selected for admission to <strong>{user['class_applying']}</strong> for the session <strong>{user['session']}</strong>, subject to verification of original documents and payment of dues.</p>
<div class="highlight">
<strong>Reporting Date:</strong> {fmt_date(user.get('joining_date','2026-06-15'))}<br>
<strong>Fee Submission Deadline:</strong> {fmt_date(user.get('fee_deadline','2026-06-10'))}<br>
<strong>Venue:</strong> Cadet College Murree, Murree, Punjab
</div>
<p>Kindly report on the above date with <strong>all original documents</strong> and the fee deposit slip. Failure to report on time will result in cancellation of this offer.</p>
<p>We look forward to welcoming {user['first_name']} to the Cadet College Murree family.</p>
<p>Yours faithfully,</p>
<div class="sig">
<div class="line"></div>
<p><strong>Controller of Admissions</strong><br>Cadet College Murree<br>Punjab, Pakistan</p>
</div>
<br>
<button onclick="window.print()" style="background:#064A1A;color:#fff;padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Print Offer Letter</button>
</div>
<img src="data:image/png;base64,{lh}" class="footer-img" alt="Footer">
</body></html>"""

# ─── Page: LOGIN ──────────────────────────────────────────────────────────────
def page_login():
    col1, col2, col3 = st.columns([1, 1.6, 1])
    with col2:
        st.markdown("""
        <div class="login-header">
            <h1>🎓 CCM Candidate Portal</h1>
            <p>Cadet College Murree — Punjab, Pakistan</p>
        </div>
        """, unsafe_allow_html=True)

        with st.container(border=True):
            st.markdown("### Sign In")
            username = st.text_input("Email or Phone Number", placeholder="e.g. hamza@example.com", key="login_user")
            password = st.text_input("Password", type="password", placeholder="Enter your password", key="login_pass")

            if st.session_state.login_error:
                st.error(st.session_state.login_error)

            if st.button("Login →", use_container_width=True, type="primary"):
                user = authenticate(username, password)
                if user:
                    st.session_state.authenticated = True
                    st.session_state.user = user
                    st.session_state.login_error = ""
                    st.rerun()
                else:
                    st.session_state.login_error = "Invalid credentials. Check your email/phone and password."
                    st.rerun()

        st.markdown("""
        <div class="demo-box">
            <h5>🧪 Demo Accounts</h5>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><th style="text-align:left;padding:4px 8px;background:#d1fae5;">Email</th>
                <th style="text-align:left;padding:4px 8px;background:#d1fae5;">Password</th>
                <th style="text-align:left;padding:4px 8px;background:#d1fae5;">Status</th></tr>
            <tr><td style="padding:4px 8px;"><code>hamza@example.com</code></td><td style="padding:4px 8px;"><code>12345</code></td><td style="padding:4px 8px;">✅ Selected (Merit #1)</td></tr>
            <tr><td style="padding:4px 8px;"><code>ali@example.com</code></td><td style="padding:4px 8px;"><code>12345</code></td><td style="padding:4px 8px;">📅 Test Scheduled</td></tr>
            <tr><td style="padding:4px 8px;"><code>fawad@example.com</code></td><td style="padding:4px 8px;"><code>12345</code></td><td style="padding:4px 8px;">❌ Not Selected</td></tr>
            </table>
            <p style="margin:6px 0 0;font-size:11px;color:#065f46;">Default password for all new accounts is <code>12345</code>. Change it after first login.</p>
        </div>
        """, unsafe_allow_html=True)

        st.markdown("""
        <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
        Don't have an account? Complete the
        <a href="/admissions" style="color:#064A1A;font-weight:600;">Online Application</a>
        first — your credentials are provided on completion.
        </p>
        """, unsafe_allow_html=True)

# ─── Page: DASHBOARD ─────────────────────────────────────────────────────────
def page_dashboard():
    user = st.session_state.user
    status = user["status"]
    idx = STATUS_IDX.get(status, 0)
    progress_pct = int(((idx + 1) / len(STAGES)) * 100)

    st.markdown(f"""
    <div class="welcome-banner">
        <h2>Welcome back, {user['first_name']}! 👋</h2>
        <p>Applicant ID: <strong>{user['ref_id']}</strong> &nbsp;·&nbsp; Session: {user['session']} &nbsp;·&nbsp; {user['class_applying']}</p>
    </div>
    """, unsafe_allow_html=True)

    # Key metrics
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("Class", user["class_applying"])
    with c2:
        stage_title = STAGES[min(idx, len(STAGES)-1)]["title"]
        st.metric("Current Stage", stage_title[:18] + "…" if len(stage_title) > 18 else stage_title)
    with c3:
        docs_done = sum(1 for d in user["docs"].values() if d["uploaded"])
        st.metric("Documents", f"{docs_done} / {len(user['docs'])}")
    with c4:
        f = user["fee"]
        fee_status_raw = f["status"]
        FEE_STATUS_LABELS = {
            "paid": "✅ Paid",
            "bank_pending": "🕐 Bank Pending",
            "pending": "⏳ Pending",
            "free": "🆓 Free",
        }
        fee_label = FEE_STATUS_LABELS.get(fee_status_raw, fee_status_raw.upper())
        st.metric("Fee Status", fee_label)

    # Progress bar
    st.markdown(f"**Application Progress: {progress_pct}%**")
    st.progress(progress_pct / 100)
    st.caption(f"Stage {idx + 1} of {len(STAGES)}: **{STAGES[min(idx, len(STAGES)-1)]['title']}**")

    st.divider()

    # Quick actions
    st.subheader("Quick Actions")
    r = user["result_status"]
    qa_cols = st.columns(4)
    actions = [
        ("📋", "Application Status", "🟢 Application Status"),
        ("📂", "Documents",          "📂 Documents"),
        ("🏦", "Fee Challan",        "🏦 Fee Challan"),
        ("🎫", "Admit Card",         "🎫 Admit Card"),
    ]
    for i, (icon, page, label) in enumerate(actions):
        with qa_cols[i]:
            if st.button(f"{icon} {label.split(' ',1)[1]}", use_container_width=True):
                st.session_state.page = page
                st.rerun()

    qa_cols2 = st.columns(4)
    actions2 = [
        ("🏆", "Entry Test Result", "🏆 Entry Test Result"),
        ("📜", "Offer Letter",      "📜 Offer Letter"),
        ("📋", "Joining Instructions", "📋 Joining Instructions"),
        ("🔄", "Re-application",    "🔄 Re-application"),
    ]
    for i, (icon, page, label) in enumerate(actions2):
        with qa_cols2[i]:
            if st.button(f"{icon} {label.split(' ',2)[-1]}", use_container_width=True):
                st.session_state.page = page
                st.rerun()

    st.divider()

    # Personal info summary
    st.subheader("Application Summary")
    left, right = st.columns(2)
    with left:
        st.markdown("**Student Details**")
        info = {
            "Full Name": user["name"],
            "Father's Name": user["father_name"],
            "Date of Birth": fmt_date(user["date_of_birth"]),
            "Blood Group": user["blood_group"],
            "Class Applying": user["class_applying"],
        }
        for label, val in info.items():
            st.markdown(f"<div style='display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb;font-size:14px;'>"
                        f"<span style='color:#6b7280;'>{label}</span><span style='font-weight:600;'>{val}</span></div>",
                        unsafe_allow_html=True)
    with right:
        st.markdown("**Contact & Test Details**")
        info2 = {
            "Email": user["email"],
            "Phone": user["phone"],
            "City": user["city"],
            "Exam Centre": user["exam_center"],
            "Roll Number": user.get("roll_no", "—"),
        }
        for label, val in info2.items():
            st.markdown(f"<div style='display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e5e7eb;font-size:14px;'>"
                        f"<span style='color:#6b7280;'>{label}</span><span style='font-weight:600;'>{val}</span></div>",
                        unsafe_allow_html=True)

# ─── Page: APPLICATION STATUS ─────────────────────────────────────────────────
def page_status():
    user = st.session_state.user
    status = user["status"]
    current_idx = STATUS_IDX.get(status, 0)
    progress_pct = int(((current_idx + 1) / len(STAGES)) * 100)

    st.title("📋 Application Status")
    st.caption(f"Applicant ID: **{user['ref_id']}** · Submitted: 28 April 2026")

    st.progress(progress_pct / 100)
    st.markdown(f"**Stage {current_idx + 1} of {len(STAGES)} — {progress_pct}% complete**")
    st.markdown("")

    for i, stage in enumerate(STAGES):
        is_done    = i < current_idx
        is_current = i == current_idx
        is_future  = i > current_idx
        date_label = ""
        if is_done or is_current:
            demo_dates = ["2026-04-28","2026-04-30","2026-05-05","2026-05-12","2026-05-28","—"]
            raw = demo_dates[i] if i < len(demo_dates) else ""
            date_label = fmt_date(raw) if raw != "—" else "—"

        if is_done:
            icon_disp = "✅"
            css_class = "stage-done"
            state_label = f"<span style='color:#065f46;font-size:12px;'>Completed · {date_label}</span>"
        elif is_current:
            icon_disp = stage["icon"]
            css_class = "stage-active"
            state_label = f"<span style='background:#064A1A;color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;'>Current</span> <span style='color:#6b7280;font-size:12px;'>{date_label}</span>"
        else:
            icon_disp = "○"
            css_class = "stage-pending"
            state_label = "<span style='color:#9ca3af;font-size:12px;'>Pending</span>"

        st.markdown(f"""
        <div class="{css_class}">
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:20px;">{icon_disp}</span>
                <div style="flex:1;">
                    <strong>{stage['title']}</strong>
                    <div style="font-size:13px;color:#6b7280;margin-top:2px;">{stage['desc']}</div>
                </div>
                <div style="text-align:right;">{state_label}</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

    st.divider()
    st.info("📞 For any queries, contact the Admissions Office: **0304-1111024** (Mon–Sat, 9am–5pm)")

# ─── Page: DOCUMENTS ─────────────────────────────────────────────────────────
def page_documents():
    user = st.session_state.user
    st.title("📂 Documents")
    st.caption("Upload required documents. All files must be clear scans/photos (JPG, PNG, PDF). Max size: 5 MB.")

    uploaded_state = st.session_state.uploaded_docs

    for doc_name, doc_info in user["docs"].items():
        with st.container(border=True):
            col_info, col_status, col_action = st.columns([2.5, 1, 1.5])

            with col_info:
                st.markdown(f"**{doc_name}**")
                if doc_name == "Birth Certificate":
                    st.caption("Original birth certificate issued by NADRA / Union Council")
                elif doc_name == "B-Form (Child CNIC)":
                    st.caption("Child's NADRA B-Form (Form B)")
                elif doc_name == "School Leaving Cert":
                    st.caption("School Leaving / Transfer Certificate from previous school")
                elif doc_name == "Student Photo":
                    st.caption("Recent passport-size photograph (white background)")
                elif doc_name == "Medical Fitness Cert":
                    st.caption("Medical fitness certificate from a registered doctor")

            with col_status:
                is_up = doc_info["uploaded"] or (doc_name in uploaded_state)
                is_ver = doc_info["verified"]
                if is_ver:
                    st.markdown('<span class="badge-selected">✅ Verified</span>', unsafe_allow_html=True)
                elif is_up:
                    st.markdown('<span class="badge-wait">🔍 Under Review</span>', unsafe_allow_html=True)
                else:
                    st.markdown('<span class="badge-not">❌ Not Uploaded</span>', unsafe_allow_html=True)

            with col_action:
                if not (doc_info["uploaded"] or doc_name in uploaded_state):
                    uploaded_file = st.file_uploader(
                        f"Upload {doc_name}",
                        type=["jpg","jpeg","png","pdf"],
                        key=f"up_{doc_name}",
                        label_visibility="collapsed",
                    )
                    if uploaded_file:
                        size_mb = uploaded_file.size / (1024 * 1024)
                        if size_mb > 5:
                            st.error("File exceeds 5 MB limit.")
                        else:
                            st.session_state.uploaded_docs[doc_name] = uploaded_file.name
                            st.success(f"✅ Uploaded!")
                            st.rerun()
                else:
                    st.markdown("📄 File submitted")
                    if doc_info["verified"]:
                        st.caption("No action needed.")

    # Summary
    total = len(user["docs"])
    done  = sum(1 for n, d in user["docs"].items() if d["uploaded"] or n in uploaded_state)
    missing = [n for n, d in user["docs"].items() if not d["uploaded"] and n not in uploaded_state]
    st.divider()
    st.markdown(f"**Progress: {done}/{total} documents submitted**")
    st.progress(done / total)
    if missing:
        st.warning(f"Still required: {', '.join(missing)}")
    else:
        st.success("🎉 All documents submitted! The admissions team will verify them within 2–3 working days.")

# ─── Page: FEE CHALLAN ───────────────────────────────────────────────────────
def page_challan():
    user = st.session_state.user
    f = user["fee"]
    st.title("🏦 Fee Challan")
    st.caption("Entry test application processing fee. Pay at any NBP branch or via internet banking.")

    fee_badge = f'<span class="badge-paid">✅ PAID</span>' if f["status"] == "paid" else f'<span class="badge-not">⚠️ UNPAID</span>'
    st.markdown(f"**Payment Status:** {fee_badge}", unsafe_allow_html=True)
    st.markdown("")

    left, right = st.columns([1.5, 1])
    with left:
        st.markdown(f"""
        <div class="challan">
            <div class="challan-header">
                <strong style="font-size:16px;">🏛️ CADET COLLEGE MURREE</strong><br>
                <span style="font-size:12px;opacity:.85;">Fee Challan — Entry Test Application 2026-27</span>
            </div>
            <div class="challan-body">
                <div class="challan-row"><span>Challan No.</span><strong>{f['challan_no']}</strong></div>
                <div class="challan-row"><span>Applicant</span><strong>{user['name']}</strong></div>
                <div class="challan-row"><span>Father's Name</span><strong>{user['father_name']}</strong></div>
                <div class="challan-row"><span>Class</span><strong>{user['class_applying']}</strong></div>
                <div class="challan-row"><span>Applicant ID</span><strong>{user['ref_id']}</strong></div>
                <div class="challan-row"><span>Bank</span><strong>{f['bank']}</strong></div>
                <div class="challan-row"><span>Account No.</span><strong>{f['account']}</strong></div>
                <div class="challan-row"><span>Due Date</span><strong style="color:#dc2626;">{fmt_date(f['due_date'])}</strong></div>
                <div class="challan-amount">{fmt_currency(f['amount'])} /-<br><small style="font-size:13px;">Two Thousand Only</small></div>
            </div>
        </div>
        """, unsafe_allow_html=True)

    with right:
        st.markdown("**📌 Payment Instructions**")
        st.markdown(f"""
        1. Visit any **National Bank of Pakistan** branch
        2. Present this challan to the cashier
        3. Pay **{fmt_currency(2000)}** in cash or via debit card
        4. Collect the stamped bank copy
        5. Upload payment proof on the **Payment Confirmation** page
        6. Keep the original challan for college records
        """)
        st.info("📧 A copy has been sent to your registered email address.")

    st.divider()
    download_html(challan_html(user), f"challan_{user['ref_id']}.html", "Download Challan (HTML/Print)")

# ─── Page: PAYMENT CONFIRMATION ──────────────────────────────────────────────
PAYMENT_METHOD_LABELS = {
    "bank_deposit": "Bank Deposit",
    "jazzcash": "JazzCash",
    "payfast": "PayFast",
    "simulate": "Online Payment (Simulated)",
    "free": "Free (Waived)",
}

def page_payment():
    user = st.session_state.user
    f = user["fee"]
    st.title("💳 Payment Confirmation")
    st.caption("Upload your bank payment receipt to confirm fee submission.")

    method_label = PAYMENT_METHOD_LABELS.get(f.get("method", ""), f.get("method", "—") or "—")

    if f["status"] == "paid":
        st.success("✅ Your fee payment has already been confirmed and verified by the admissions office.")
        st.markdown(f"""
        | Detail | Value |
        |---|---|
        | Challan No. | {f['challan_no']} |
        | Amount Paid | {fmt_currency(f['amount'])} |
        | Payment Method | {method_label} |
        | Status | **Verified** |
        """)
        return

    if f["status"] == "bank_pending":
        st.warning("🕐 **Bank deposit received — verification in progress.**\n\nYour bank deposit is being verified by our accounts office — this typically takes 1–2 business days. No action is needed from you right now.")
        st.markdown(f"""
        | Detail | Value |
        |---|---|
        | Challan No. | {f['challan_no']} |
        | Amount | {fmt_currency(f['amount'])} |
        | Payment Method | {method_label} |
        | Status | **Pending Verification** |
        """)
        st.info("📞 Questions? Call **0304-1111024** or WhatsApp during office hours (Mon–Sat, 9am–5pm).")
        return

    with st.container(border=True):
        st.markdown("### Upload Payment Proof")
        receipt_no = st.text_input("Bank Receipt / Transaction Number", placeholder="e.g. TXN-20260428-001234")
        payment_date = st.date_input("Payment Date")
        proof_file = st.file_uploader("Upload Receipt (JPG, PNG or PDF)", type=["jpg","jpeg","png","pdf"])

        if proof_file:
            if proof_file.type.startswith("image"):
                st.image(proof_file, caption="Receipt Preview", width=320)
            else:
                st.info(f"📄 File selected: {proof_file.name}")

        if st.button("Submit Payment Proof", type="primary", use_container_width=True):
            if not receipt_no:
                st.error("Please enter the bank receipt / transaction number.")
            elif not proof_file:
                st.error("Please upload the payment receipt.")
            else:
                st.success("🎉 Payment proof submitted! The admissions office will verify within 1 working day.")
                st.balloons()

    st.divider()
    st.info("📞 Payment issues? Call **0304-1111024** or WhatsApp during office hours (Mon–Sat, 9am–5pm).")

# ─── Page: ADMIT CARD ────────────────────────────────────────────────────────
def page_admit_card():
    user = st.session_state.user
    st.title("🎫 Admit Card / Roll Number Slip")

    if not user.get("roll_no"):
        st.warning("⏳ Your admit card will be available once the entry test is scheduled. Check back soon.")
        return

    st.success(f"✅ Your entry test is scheduled on **{fmt_date(user['test_date'])}** at **{user['test_venue']}**.")

    left, right = st.columns([2, 1])
    with left:
        st.markdown(f"""
        <div class="admit-card">
            <h2>CADET COLLEGE MURREE</h2>
            <p style="text-align:center;color:#6b7280;margin:0 0 8px;">Entry Test Admit Card — Session {user['session']}</p>
            <hr style="border-color:#064A1A;">
            <div class="roll">{user['roll_no']}</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;">
                <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Candidate Name</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">{user['name']}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Father's Name</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">{user['father_name']}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Class</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">{user['class_applying']}</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Test Date</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;"><strong style="color:#064A1A;">{fmt_date(user['test_date'])}</strong></td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Reporting Time</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">{user['test_time']} (30 min early)</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;">Test Centre</td>
                    <td style="padding:6px 10px;border:1px solid #e5e7eb;">{user['test_venue']}</td></tr>
            </table>
        </div>
        """, unsafe_allow_html=True)

    with right:
        st.markdown("**📋 Instructions**")
        instructions = [
            "Bring this card and original B-Form / CNIC",
            "Report 30 minutes before the test",
            "Blue or black ballpoint pen only",
            "No mobile phones or electronic devices",
            "Any cheating = immediate disqualification",
            "This card is valid for this date only",
        ]
        for inst in instructions:
            st.markdown(f"• {inst}")

    st.divider()
    download_html(admit_card_html(user), f"admit_card_{user['roll_no']}.html", "Download Admit Card (HTML/Print)")

# ─── Page: ENTRY TEST RESULT ─────────────────────────────────────────────────
def page_results():
    user = st.session_state.user
    st.title("🏆 Entry Test Result")

    if user.get("marks") is None:
        st.info("⏳ Results have not been announced yet. Check back after your entry test.")
        return

    result_status = user.get("result_status")

    # Status banner
    if result_status == "selected":
        st.success(f"🎉 **SELECTED** — Congratulations! You have been selected for {user['class_applying']}, Session {user['session']}.")
        st.balloons()
    elif result_status == "wait_listed":
        st.warning("⏳ **WAIT LISTED** — You are on the waiting list. You will be contacted if a seat becomes available.")
    else:
        st.error("❌ **NOT SELECTED** — We regret to inform you that you were not selected in this session.")

    st.divider()
    left, right = st.columns([1.6, 1])

    with left:
        st.markdown("### Subject-wise Scores")
        subjects = user.get("subjects", {})
        for subject, scores in subjects.items():
            ob, tot = scores["obtained"], scores["total"]
            pct = ob / tot
            col_s, col_p, col_n = st.columns([1.5, 2.5, 0.6])
            with col_s:
                st.markdown(f"<p style='margin:6px 0;font-size:14px;'><strong>{subject}</strong></p>", unsafe_allow_html=True)
            with col_p:
                st.progress(pct)
            with col_n:
                st.markdown(f"<p style='margin:6px 0;text-align:right;font-size:14px;'><strong>{ob}/{tot}</strong></p>", unsafe_allow_html=True)

    with right:
        marks = user["marks"]
        total = user["total_marks"]
        pct = int((marks / total) * 100)
        merit = user.get("merit", "—")
        st.markdown("### Overall Score")
        st.markdown(f"""
        <div style="text-align:center;background:#f0fdf4;border:2px solid #064A1A;border-radius:12px;padding:24px;margin-bottom:12px;">
            <div style="font-size:48px;font-weight:900;color:#064A1A;">{marks}</div>
            <div style="font-size:18px;color:#6b7280;">out of {total}</div>
            <div style="font-size:24px;font-weight:700;color:#03CC0B;margin-top:4px;">{pct}%</div>
        </div>
        <div style="text-align:center;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
            <div style="font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Merit Rank</div>
            <div style="font-size:32px;font-weight:900;color:#064A1A;">#{merit}</div>
            <div style="font-size:12px;color:#6b7280;">{user['class_applying']}</div>
        </div>
        """, unsafe_allow_html=True)

    # Score card data
    st.divider()
    st.markdown("### Score Summary")
    df = pd.DataFrame([
        {"Subject": s, "Obtained": d["obtained"], "Total": d["total"],
         "Percentage": f"{int(d['obtained']/d['total']*100)}%"}
        for s, d in (user.get("subjects") or {}).items()
    ])
    if not df.empty:
        df.loc[len(df)] = {"Subject":"**TOTAL**","Obtained":user["marks"],"Total":user["total_marks"],"Percentage":f"{pct}%"}
        st.dataframe(df, use_container_width=True, hide_index=True)

# ─── Page: OFFER LETTER ──────────────────────────────────────────────────────
def page_offer_letter():
    user = st.session_state.user
    st.title("📜 Offer Letter")

    if user.get("result_status") != "selected":
        if user.get("result_status") is None:
            st.info("⏳ Offer letter will be available after the result is announced and you are selected.")
        else:
            st.warning("The offer letter is only available for selected candidates.")
        return

    st.success("✅ You have been issued a provisional offer letter. Download and print it for your records.")

    with st.container(border=True):
        st.markdown(f"""
<div class="offer-letter">
<h2 style="text-align:center;color:#064A1A;letter-spacing:1px;">CADET COLLEGE MURREE</h2>
<p style="text-align:center;color:#6b7280;margin-top:-8px;font-size:13px;">Murree, Punjab — Pakistan &nbsp;|&nbsp; Ph: 0304-1111024</p>
<hr>
<p style="text-align:right;color:#6b7280;font-size:13px;"><strong>Ref:</strong> CCM/ADM/{user['ref_id']}/2026</p>
<p><strong>Date:</strong> {fmt_date(user.get('offer_date','2026-05-28'))}</p>
<p><strong>To,</strong><br>
{user['father_name']}<br>
Parent / Guardian of <strong>{user['name']}</strong></p>
<p><strong><u>Subject: Provisional Offer of Admission — Session {user['session']}</u></strong></p>
<p>Dear Sir,</p>
<p>On behalf of the Principal, Cadet College Murree, I am pleased to inform you that <strong>{user['name']}</strong>
(Roll No. {user['roll_no']}) has been provisionally selected for admission to
<strong>{user['class_applying']}</strong> for the session <strong>{user['session']}</strong>.</p>
<div style="background:#f0fdf4;border-left:4px solid #064A1A;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;">
<strong>📅 Reporting Date:</strong> {fmt_date(user.get('joining_date','2026-06-15'))}<br>
<strong>⏰ Fee Submission Deadline:</strong> {fmt_date(user.get('fee_deadline','2026-06-10'))}<br>
<strong>📍 Venue:</strong> Cadet College Murree, Murree, Punjab
</div>
<p>Please report on the above date with <strong>all original documents</strong> and the fee deposit slip.
Failure to report on time may result in cancellation of this offer.</p>
<p>Congratulations and we look forward to welcoming {user['first_name']} to the CCM family.</p>
<p>Yours faithfully,<br><br><br>
<strong>____________________________</strong><br>
<strong>Controller of Admissions</strong><br>
Cadet College Murree, Punjab, Pakistan</p>
</div>
        """, unsafe_allow_html=True)

    st.divider()
    download_html(offer_letter_html(user), f"offer_letter_{user['ref_id']}.html", "Download Offer Letter (HTML/Print)")

# ─── Page: JOINING INSTRUCTIONS ──────────────────────────────────────────────
def page_joining():
    user = st.session_state.user
    st.title("📋 Joining Instructions")

    if user.get("result_status") != "selected":
        st.info("⏳ Joining instructions will be available once you are selected and issued an offer letter.")
        return

    st.success(f"✅ **Reporting Date: {fmt_date(user.get('joining_date','2026-06-15'))}** · Fee Deadline: {fmt_date(user.get('fee_deadline','2026-06-10'))}")
    st.markdown("")

    st.subheader("📦 Items to Bring on Joining Day")
    items = [
        ("📄", "Offer Letter",                    "This offer letter (printed)"),
        ("📋", "Application Form",                "Printed copy of your online application form"),
        ("🪪", "Original Documents",              "Birth Certificate, B-Form, School Leaving Cert, Medical Fitness Cert"),
        ("📸", "Photographs",                     "6 recent passport-size photographs (white background)"),
        ("🏦", "Fee Deposit Slip",                "Original bank challan stamped by NBP"),
        ("📚", "School Character Certificate",    "Good character certificate from previous school"),
        ("🏥", "Medical Fitness Certificate",     "Certificate from a registered MBBS doctor"),
        ("👔", "Civilian Clothes",                "For the first day (uniform issued on joining)"),
        ("🧳", "Personal Belongings",             "Allowed list will be communicated separately"),
    ]
    for emoji, title, desc in items:
        col_e, col_t = st.columns([0.08, 0.92])
        with col_e:
            st.markdown(f"<p style='font-size:22px;margin:4px 0;'>{emoji}</p>", unsafe_allow_html=True)
        with col_t:
            st.markdown(f"**{title}** — {desc}")

    st.divider()
    st.subheader("📅 Important Dates & Deadlines")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Fee Deadline", fmt_date(user.get("fee_deadline", "2026-06-10")))
    with col2:
        st.metric("Reporting Date", fmt_date(user.get("joining_date", "2026-06-15")))
    with col3:
        st.metric("Session Start", "1 August 2026")

    st.divider()
    st.subheader("⚠️ Important Notes")
    notes = [
        "Students must report with their parent / guardian on the joining date.",
        "Late arrivals (without prior written permission) may lose the seat.",
        "Bring original documents — photocopies are NOT accepted for verification.",
        "Fee must be paid before the deadline via NBP challan only.",
        "Mobile phones are NOT permitted inside the college campus for students.",
        "For any queries, contact the Admissions Office at **0304-1111024**.",
    ]
    for note in notes:
        st.markdown(f"• {note}")

    st.divider()
    st.subheader("✅ Pre-Joining Checklist")
    checks = [
        "Fee paid and deposit slip obtained",
        "Original documents collected",
        "Photographs taken (6 copies)",
        "Medical fitness certificate obtained",
        "Character certificate obtained from previous school",
        "Travel arrangements confirmed",
        "Emergency contact numbers saved",
    ]
    all_done = []
    for i, check in enumerate(checks):
        done = st.checkbox(check, key=f"chk_{i}")
        all_done.append(done)
    if all(all_done):
        st.success("🎉 All items checked! You are ready for joining day.")

# ─── Page: RE-APPLICATION ────────────────────────────────────────────────────
def page_reapply():
    user = st.session_state.user
    st.title("🔄 Re-application")
    result = user.get("result_status")

    if result == "selected":
        st.success("🎉 You have already been selected! No re-application is needed.")
        st.markdown("Please proceed to the **Joining Instructions** page for next steps.")
        if st.button("View Joining Instructions →"):
            st.session_state.page = "📋 Joining Instructions"
            st.rerun()
        return

    if result == "wait_listed":
        st.warning("⏳ You are currently on the **Wait List**.")
        st.markdown("""
        - Wait-listed candidates are contacted **in merit order** as seats become available.
        - If a seat opens before **30 June 2026**, you will receive an SMS and email.
        - If you do not receive a call by 30 June, you may re-apply for the **next session (2027-28)**.
        """)
        st.divider()

    if result in ("not_selected", "wait_listed"):
        st.subheader("📝 Apply for Next Session")
        st.markdown("""
        Applications for **Session 2027-28** will open in **January 2027**.
        To be notified when admissions open:
        """)
        with st.form("notify_form"):
            email = st.text_input("Your Email", value=user["email"])
            phone = st.text_input("Your Phone", value=user["phone"])
            notify_class = st.selectbox("Class for Next Session", ["Class VI","Class VII","Class VIII","Class IX","Class XI (Pre-Medical)","Class XI (Pre-Engineering)","Class XI (ICS)"])
            submitted = st.form_submit_button("🔔 Notify Me When Admissions Open", type="primary")
            if submitted:
                st.success(f"✅ We'll notify you at **{email}** and **{phone}** when {notify_class} admissions open for 2027-28.")

    st.divider()
    st.markdown("**💡 Tips to Improve for Next Session:**")
    tips = [
        "Focus on English grammar, comprehension, and vocabulary",
        "Practice mental math and basic algebra daily",
        "Read Urdu prose and poetry from the national curriculum",
        "Solve past papers of entry tests",
        "Improve your IQ / verbal reasoning score through practice tests",
        "Maintain 80%+ marks in current class",
    ]
    for tip in tips:
        st.markdown(f"✏️ {tip}")

    st.divider()
    if st.button("🌐 View Online Admission Portal →", type="primary"):
        st.markdown('<meta http-equiv="refresh" content="0;url=/admissions">', unsafe_allow_html=True)

# ─── Page: SETTINGS ──────────────────────────────────────────────────────────
def page_settings():
    user = st.session_state.user
    st.title("⚙️ Settings")

    with st.expander("🔑 Change Password", expanded=True):
        with st.form("pwd_form"):
            current = st.text_input("Current Password", type="password")
            new_pwd = st.text_input("New Password", type="password")
            confirm = st.text_input("Confirm New Password", type="password")
            if st.form_submit_button("Update Password"):
                if current != user["password"]:
                    st.error("Current password is incorrect.")
                elif len(new_pwd) < 6:
                    st.error("New password must be at least 6 characters.")
                elif new_pwd != confirm:
                    st.error("Passwords do not match.")
                else:
                    st.session_state.user["password"] = new_pwd
                    st.success("✅ Password updated successfully!")

    with st.expander("📧 Contact Information"):
        st.markdown(f"**Email:** {user['email']}")
        st.markdown(f"**Phone:** {user['phone']}")
        st.info("To update contact information, please contact the admissions office at **0304-1111024**.")

    with st.expander("ℹ️ Account Information"):
        st.markdown(f"**Applicant ID:** {user['ref_id']}")
        st.markdown(f"**Name:** {user['name']}")
        st.markdown(f"**Session:** {user['session']}")
        st.markdown(f"**Class:** {user['class_applying']}")

# ─── Main App ─────────────────────────────────────────────────────────────────
def show_main_app():
    user = st.session_state.user

    with st.sidebar:
        st.markdown(f"""
        <div style="text-align:center;padding:12px 0;">
            <div style="font-size:32px;">🎓</div>
            <div style="font-weight:700;color:#064A1A;font-size:16px;">CCM Portal</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">Cadet College Murree</div>
        </div>
        """, unsafe_allow_html=True)
        st.divider()

        # Student info
        result = user.get("result_status")
        if result == "selected":
            badge = '<span class="badge-selected">✅ Selected</span>'
        elif result == "wait_listed":
            badge = '<span class="badge-wait">⏳ Wait Listed</span>'
        elif result == "not_selected":
            badge = '<span class="badge-not">❌ Not Selected</span>'
        else:
            idx = STATUS_IDX.get(user["status"], 0)
            stage_name = STAGES[idx]["title"][:14] + "…" if len(STAGES[idx]["title"]) > 14 else STAGES[idx]["title"]
            badge = f'<span class="badge-pending">📋 {stage_name}</span>'

        st.markdown(f"""
        <div style="background:#f0fdf4;border:1px solid #6ee7b7;border-radius:8px;padding:10px 12px;margin-bottom:12px;">
            <div style="font-weight:700;font-size:14px;color:#064A1A;">{user['first_name']}</div>
            <div style="font-size:11px;color:#6b7280;margin:2px 0;">{user['ref_id']}</div>
            <div style="margin-top:6px;">{badge}</div>
        </div>
        """, unsafe_allow_html=True)

        # Navigation
        nav_items = [
            "🏠 Dashboard",
            "📋 Application Status",
            "📂 Documents",
            "🏦 Fee Challan",
            "💳 Payment Confirmation",
            "🎫 Admit Card",
            "🏆 Entry Test Result",
            "📜 Offer Letter",
            "📋 Joining Instructions",
            "🔄 Re-application",
            "⚙️ Settings",
        ]
        selected_page = st.radio("Navigation", nav_items, key="main_nav",
                                  index=nav_items.index(st.session_state.page) if st.session_state.page in nav_items else 0,
                                  label_visibility="collapsed")
        st.session_state.page = selected_page

        st.divider()
        if st.button("🚪 Logout", use_container_width=True):
            st.session_state.authenticated = False
            st.session_state.user = None
            st.session_state.page = "🏠 Dashboard"
            st.rerun()

        st.markdown("<p style='text-align:center;font-size:11px;color:#9ca3af;margin-top:8px;'>CCM Admissions Portal v1.0</p>", unsafe_allow_html=True)

    # Route to page
    page = st.session_state.page
    if   page == "🏠 Dashboard":           page_dashboard()
    elif page == "📋 Application Status":  page_status()
    elif page == "📂 Documents":           page_documents()
    elif page == "🏦 Fee Challan":         page_challan()
    elif page == "💳 Payment Confirmation":page_payment()
    elif page == "🎫 Admit Card":          page_admit_card()
    elif page == "🏆 Entry Test Result":   page_results()
    elif page == "📜 Offer Letter":        page_offer_letter()
    elif page == "📋 Joining Instructions":page_joining()
    elif page == "🔄 Re-application":      page_reapply()
    elif page == "⚙️ Settings":           page_settings()

# ─── Entry point ─────────────────────────────────────────────────────────────
if not st.session_state.authenticated:
    page_login()
else:
    show_main_app()
