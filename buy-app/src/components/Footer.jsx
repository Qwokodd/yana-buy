import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-indigo-950 text-white/70 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
        <div className="col-span-2 sm:col-span-1">
          <div className="font-display text-xl font-bold text-white mb-2">
            Yana Buy<span className="text-mango">.</span>
          </div>
          <p className="text-sm">Buy anything. Sell everything. One marketplace.</p>
        </div>
        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Shop</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/" className="hover:text-white">Browse products</Link></li>
            <li><Link to="/search?q=" className="hover:text-white">All stores</Link></li>
            <li><Link to="/cart" className="hover:text-white">My cart</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Sell</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/sell" className="hover:text-white">Open a store</Link></li>
            <li><Link to="/login" className="hover:text-white">Vendor login</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white text-sm font-semibold mb-3">Payments</h4>
          <ul className="space-y-2 text-sm">
            <li>Visa &amp; Mastercard</li>
            <li>MTN Mobile Money</li>
            <li>Vodafone Cash · AirtelTigo Money</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs">
        © {new Date().getFullYear()} Yana Buy. Demo project — not affiliated with any other marketplace.
      </div>
    </footer>
  );
}
