import Image from "next/image";
import { Search, Heart, ChevronLeft } from "lucide-react"; // Install lucide-react for icons
import { BOOKS, CATEGORIES } from "../mockup/book";
export default function DiscoverBooks() {
    
  return (
    <div className=" mx-auto p-6 bg-gray-100 font-sans min-h-screen">
      {/*  Header & Search */}
     <div className="flex items-center gap-2 text-gray-800 mb-8 mx-15 cursor-pointer">
        <ChevronLeft size={24}  />
        <h2 className="text-xl font-bold ">Discover Books</h2>
      </div>
      <div className="relative mx-15  mb-6">
        <Search className="absolute left-3 top-3 text-gray-600" size={20} />
        <input 
          type="text" 
          placeholder="Search books, authors, genres..." 
          className="w-[600px] pl-10 pr-4 py-3 border rounded-2xl focus:outline-none text-gray-400 focus:ring-2 focus:ring-blue-500 "
        />
      </div>

      {/* . Category Filter */}
      <div className="flex gap-3 mb-10 mx-15  overflow-x-auto pb-2">
            {CATEGORIES.map((cat) => (
                 <button 
                   key={cat}
                   className={`px-6 py-2 rounded-full border text-sm font-medium transition-colors
                   ${cat === 'All' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    >
                      {cat}
                  </button>
                             ))}
      </div>

      {/*  Book Grid */}
      <div className="grid mx-15 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {BOOKS.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}
interface Book {
  id: number;
  title: string;
  author: string;
  price: number;
  rating: number;
  category: string;
  image: string;
}
//  Individual Book Card Component
function BookCard({ book }: { book: Book }) {
  return (
    <div className="bg-white  rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      {/* Image Container */}
      <div className="relative h-48 w-full bg-gray-200">
        <Image 
          src={book.image} 
          alt={book.title} 
          fill 
          className="object-cover"
        />
        <button className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full hover:bg-white">
          <Heart size={18} className="text-gray-400 hover:text-red-500" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 h-40">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-500 bg-green-50 px-2 py-0.5 rounded">
            {book.category}
          </span>
          <span className="text-xs font-bold text-orange-400">{book.rating}</span>
        </div>
        
        <h3 className="font-bold text-sm text-gray-900 truncate">{book.title}</h3>
        <p className="text-xs text-gray-500 mb-3">{book.author}</p>
        
        <div className="flex items-center justify-between mt-auto">
          <span className="font-bold text-sm text-gray-900">${book.price}</span>
          <a href={`/bookdetail/${book.id}`} className="bg-blue-600 text-white text-[10px] px-3 py-1.5 rounded-md hover:bg-blue-700" >View Detail</a>
            
          
        </div>
      </div>
    </div>
  );
}