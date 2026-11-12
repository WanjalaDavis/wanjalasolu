CREATE DATABASE IF NOT EXISTS wanjala_solutions
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wanjala_solutions;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  short_description VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(80) DEFAULT 'bi-stars',
  is_featured TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portfolio (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  image VARCHAR(255),
  project_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enquiries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40),
  service_id INT UNSIGNED NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('New','In Progress','Completed','Archived') DEFAULT 'New',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_enquiry_service FOREIGN KEY (service_id)
    REFERENCES services(id) ON DELETE SET NULL
);

INSERT IGNORE INTO services
(title, slug, category, short_description, description, icon, is_featured)
VALUES
('Business Website Development','business-website-development','Web Development','Professional websites that help your business build credibility and reach more customers.','We design and develop responsive business websites tailored to your goals, brand and customers.','bi-globe2',1),
('E-commerce Websites','ecommerce-websites','Web Development','Sell products and manage orders through a modern online shop.','Online stores with product catalogues, shopping carts, order management and payment integration options.','bi-cart3',1),
('Custom Web Applications','custom-web-applications','Web Development','Purpose-built systems that solve real business and organisational problems.','We build portals, dashboards, booking systems, management systems and other custom web applications.','bi-code-slash',1),
('Government & Online Applications','government-online-applications','Cyber & Online Services','Assistance with online applications and official digital services.','Guidance and application assistance for services such as KRA, eCitizen, SHA, TSC, passports and other official portals. Requirements and approvals remain subject to the relevant authority.','bi-file-earmark-text',1),
('NTSA & Motor Vehicle Services','ntsa-motor-vehicle-services','Cyber & Online Services','Guidance with eligible motor vehicle and transport-related online processes.','Assistance with applicable NTSA processes including vehicle transfer and number plate applications, subject to official eligibility and approval.','bi-car-front',1),
('Graphic Design & Branding','graphic-design-branding','Graphic Design','Creative designs that make your brand stand out.','Logo design, posters, flyers, business cards, banners, invitations, company profiles and social media graphics.','bi-palette',1),
('Networking & IT Support','networking-it-support','Networking & IT','Reliable network setup, troubleshooting and technical support.','LAN installation, router and switch configuration, Wi-Fi setup, network troubleshooting, computer maintenance and software installation.','bi-router',1),
('Document & Academic Support','document-academic-support','Digital Services','Professional document preparation and digital assistance.','Typing, CV preparation, document formatting, data entry, printing and scanning support.','bi-file-earmark-richtext',0);
