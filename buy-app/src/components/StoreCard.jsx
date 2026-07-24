import { Link } from "react-router-dom";
import StoreLogo from "./StoreLogo";

export default function StoreCard({ store, productCount }) {
  return (
    <Link
      to={`/store/${store.id}`}
      className="group flex items-center gap-4 bg-white border border-ink/[0.06] rounded-xl p-4 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200"
    >
      <StoreLogo
        image={store.logoImage}
        emoji={store.logoEmoji}
        color={store.color}
        sizeClass="w-14 h-14"
        textSizeClass="text-2xl"
      />
      <div className="min-w-0">
        <h3 className="font-display font-semibold text-ink truncate group-hover:text-teal-600 transition-colors">
          {store.name}
        </h3>
        <p className="text-xs text-ink/50 truncate">{store.location}</p>
        {typeof productCount === "number" && (
          <p className="text-xs text-teal-600 font-mono mt-0.5">{productCount} products</p>
        )}
      </div>
    </Link>
  );
}
