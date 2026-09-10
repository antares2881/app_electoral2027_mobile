require 'xcodeproj'
root = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(root, 'PDF417Lab.xcodeproj'))
target = project.new_target(:application, 'PDF417Lab', :ios, '16.0')
target.add_file_references([project.main_group.new_file('Lab.swift')])
package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
package.repositoryURL = 'https://github.com/zxing-cpp/zxing-cpp.git'
package.requirement = { 'kind' => 'exactVersion', 'version' => '2.3.0' }
project.root_object.package_references << package
product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
product.package = package
product.product_name = 'ZXingCpp'
target.package_product_dependencies << product
build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
build_file.product_ref = product
target.frameworks_build_phase.files << build_file
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'co.convexosit.pdf417fixturelab',
    'PRODUCT_NAME' => 'PDF417Lab',
    'SWIFT_VERSION' => '5.0',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'INFOPLIST_KEY_NSCameraUsageDescription' => 'Escanear los códigos ficticios del laboratorio PDF417.',
    'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES',
    'INFOPLIST_KEY_UISupportedInterfaceOrientations' => 'UIInterfaceOrientationPortrait',
    'CODE_SIGN_STYLE' => 'Automatic',
    'DEVELOPMENT_TEAM' => ENV.fetch('PDF417_TEAM'),
    'TARGETED_DEVICE_FAMILY' => '1',
    'MARKETING_VERSION' => '1.0', 'CURRENT_PROJECT_VERSION' => '1'
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.set_launch_target(target)
scheme.save_as(project.path, 'PDF417Lab')
