import Image from "next/image";

export default function Home() {
  return (
    <div style={{ backgroundColor: 'white' }} className="flex min-h-screen  text-black items-center font-sans dark:bg-black p-4">
      <div className="flex flex-col items-center md:items-start text-black  md:text-left ml-24 mr-24">
        <h1 className="text-3xl md:text-5xl font-bold mb-4">Book Nest - <br/>Reading Community</h1>
        <h3 className="text-lg md:text-xl  dark:text-gray-300 mb-8">
          The Social Network for Book Lovers
        </h3>
        <div className="flex gap-4">
          <button className="rounded-3xl bg-white text-gray-800 shadow-xl font-medium p-3 px-8 hover:bg-gray-100 transition">
            Explore Books
          </button>
          <button className="rounded-3xl bg-blue-800 text-white shadow-xl font-medium p-3 px-8 hover:bg-blue-900 transition">
            Get Started
          </button>
        </div>
      </div>
      
      <div className="hidden md:block">
        <Image
          src="/bookhome.webp"
          alt="Home Illustration"
          width={600}
          height={400}
          priority
          className="rounded-lg"
        />
      </div>
    </div>
  );
}