import urllib.parse
import os
import qrcode
from backend.app.core.config import settings

def generate_upi_uri(upi_id: str, payee_name: str, amount: float, transaction_ref: str, notes: str = "Payment for Garments") -> str:
    """
    Standard NPCI UPI Deep Link format:
    upi://pay?pa=payee@bank&pn=PayeeName&mc=&tid=&tr=ref123&tn=note&am=1250.00&cu=INR
    """
    params = {
        "pa": upi_id,
        "pn": payee_name,
        "tr": transaction_ref,
        "tn": notes,
        "am": f"{amount:.2f}",
        "cu": "INR"
    }
    encoded_params = urllib.parse.urlencode(params)
    return f"upi://pay?{encoded_params}"

def generate_upi_qr_file(upi_uri: str, filename: str) -> str:
    filepath = os.path.join(settings.QR_DIR, filename)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(upi_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#192B3A", back_color="#FAF8F3")
    img.save(filepath)
    return filepath
