import { Link } from "react-router-dom";
import { useData } from "../context/DataContext";
import StoreLogo from "./StoreLogo";

export default function CategoryStrip() {
  const { categories } = useData();
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 -mx-1 px-1">
      {categories.map((cat) => (
        <Link
          key={cat.id}
          to={`/category/${cat.id}`}
          className="shrink-0 w-28 sm:w-32 bg-white border border-ink/[0.06] rounded-xl p-3 flex flex-col items-center gap-2 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200"
        >
          <StoreLogo
            image={cat.iconImage}
            emoji={cat.icon}
            color={cat.color}
            sizeClass="w-12 h-12"
            textSizeClass="text-xl"
          />
          <span className="text-xs font-medium text-center text-ink/80 leading-tight">
            {cat.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
