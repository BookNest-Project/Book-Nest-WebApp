import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react"

const Footer = () => {
  return (
    <footer className="flex flex-col border p-5">
        <div className="grid grid-cols-1 md:grid-cols-6">
        <div className="flex flex-col md:col-span-2 space-y-3">
            <h3 className="text-2xl font-bold">BookNest</h3>
            <p className="text-sm text-gray-800">your digital  reading journey discover ,learn and grow with  our curated collection of book and audio books</p>
            <div className="flex space-x-3 text-gray-800">
                <Twitter className="hover:text-blue-600"/>
                <Facebook className="hover:text-blue-600"/>
                <Linkedin className="hover:text-blue-600"/>
                <Instagram className="hover:text-blue-600"/>
            </div>
        </div>

        <div>
            <h5 className="text-xl font-semibold my-2">Products</h5>
            <ul>
                <li className="text-sm text-gray-800">Browse Book</li>
                <li className="text-sm text-gray-800">Audio Book</li>
                <li className="text-sm text-gray-800">Categories</li>
                <li className="text-sm text-gray-800">Pricing</li>
            </ul>
        </div>

        <div>
            <h5 className="text-xl font-semibold my-2">Company</h5>
            <ul>
                <li className="text-sm text-gray-800">About</li>
                <li className="text-sm text-gray-800">Blog</li>
                <li className="text-sm text-gray-800">Careers</li>
                <li className="text-sm text-gray-800">Contact</li>
            </ul>
        </div>

        <div>
            <h5 className="text-xl font-semibold my-2">For Authors</h5>
            <ul>
                <li className="text-sm text-gray-800">Publish with us</li>
                <li className="text-sm text-gray-800">Author dashboard</li>
                <li className="text-sm text-gray-800">Resurces</li>
                <li className="text-sm text-gray-800">Success stories</li>
            </ul>
        </div>

        <div>
            <h5 className="text-xl font-semibold my-2">Legal</h5>
            <ul>
                <li className="text-sm text-gray-800">Privacy policy</li>
                <li className="text-sm text-gray-800">Terms of services</li>
                <li className="text-sm text-gray-800">cookies policy</li>
            </ul>
        </div>
        </div>
        <hr className="my-5"/>
        <p className="text-gray-800 text-center">&copy; 2026 BookNest. All rights reserved</p>
    </footer>
  )
}

export default Footer
